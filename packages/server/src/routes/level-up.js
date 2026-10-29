/**
 * Level up (shared/level-up.js has the rules). A player levels their own character up from the sheet: when
 * they're ready, or only once the DM has given them a level, as the campaign's `level_up` setting says. The DM
 * sees each player's character level and gives (or takes back) levels; the player hears it live (their sheet
 * is saved, so `sheet` news goes out) and the sheet shows Level up.
 */
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError } from '../store.js';
import { ABILITIES, computeSheet, levelClass } from '@dndapp/shared/sheet.js';
import { LevelUpError, levelUp } from '@dndapp/shared/level-up.js';
import { ROLL_VISIBILITY } from '../rolls.js';

export function registerLevelUp(app, r) {
  const { access, db, editions, rolls, sheets, store } = r;

  const players = (cid) =>
    db.prepare("SELECT u.id, u.name, m.character_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? AND m.role = 'player' AND u.revoked_at IS NULL ORDER BY u.name").all(cid);

  /** The party as the DM sees it here: each player's active character, its level and the levels given but not taken. */
  const party = (cid) => players(cid).map((p) => {
    const { sheet, version } = sheets.get(cid, p.id);
    const classes = sheet.classes.filter((c) => c.name.trim());
    return {
      id: p.id,
      name: p.name,
      character_name: sheet.name || p.character_name || null,
      has_sheet: version > 0,
      level: classes.length ? computeSheet(sheet).level : null,
      classes: classes.map((c) => `${c.name.trim()} ${c.level}`).join(' / '),
      granted: sheet.levels_granted,
    };
  });

  /** The party's levels (DM): { level_up (the setting), players: [{ id, name, character_name, has_sheet, level, classes, granted }] }. */
  app.get('/campaigns/:cid/levels', async (request) => {
    const { cid } = access(request, { dm: true });
    return { level_up: store.getSettings(cid).level_up, players: party(cid) };
  });

  /**
   * Give a level (DM): { to: "everyone" | [player ids], take?: true (take back one given and not taken yet) }.
   * Each player's active character gets it; players with no sheet yet are left out (skipped). Returns what
   * GET /levels returns, plus { skipped: [ids] }.
   */
  app.post('/campaigns/:cid/levels/grant', async (request) => {
    const a = access(request, { dm: true });
    const { to, take } = z
      .object({ to: z.union([z.literal('everyone'), z.array(z.number().int()).min(1).max(100)]).default('everyone'), take: z.boolean().default(false) })
      .parse(request.body ?? {});
    const all = players(a.cid).map((p) => p.id);
    const ids = to === 'everyone' ? all : [...new Set(to)];
    for (const id of ids) if (!all.includes(id)) throw new BadRequestError(`User ${id} isn't a player in this campaign.`);
    const skipped = [];
    for (const uid of ids) {
      const current = sheets.get(a.cid, uid);
      if (!current.version || (take && !current.sheet.levels_granted)) { skipped.push(uid); continue; }
      const granted = Math.max(0, Math.min(20, current.sheet.levels_granted + (take ? -1 : 1)));
      sheets.save(a.cid, uid, { ...current.sheet, levels_granted: granted }, { by: request.user.id, reason: take ? 'the DM took back a level up' : 'the DM gave a level up', levels: true });
    }
    return { level_up: store.getSettings(a.cid).level_up, players: party(a.cid), skipped };
  });

  /**
   * Level up your character: { class (index of a class on the sheet) | new_class (a class name), subclass?,
   * hp: 'average' | 'roll', asi?: { ability: 1 | 2 }, feat?, visibility? }. With hp 'roll' the server rolls the
   * hit die (shared like any roll); the Constitution modifier is added by the sheet. When the DM levels
   * characters up, it takes a level they gave. Returns the roll as POST /roll does (when rolled), plus
   * { gained (hit points), entry, sheet, version, updated_at, number }.
   */
  app.post('/campaigns/:cid/sheet/level-up', async (request) => {
    const a = access(request);
    if (a.membership?.role !== 'player') throw new AuthError('Only players have a character to level up', 403);
    const body = z.object({
      class: z.number().int().min(0).max(11).optional(),
      new_class: z.string().trim().min(1).max(60).optional(),
      subclass: z.string().max(80).optional(),
      hp: z.enum(['average', 'roll']).default('average'),
      asi: z.object(Object.fromEntries(ABILITIES.map((ab) => [ab, z.number().int().min(0).max(2)]))).partial().strict().optional(),
      feat: z.string().max(100).optional(),
      visibility: z.enum(ROLL_VISIBILITY).default('party'),
    }).strict().refine((b) => (b.class == null) !== (b.new_class == null), 'Pick one class: one you have, or a new one.').parse(request.body ?? {});
    const current = sheets.get(a.cid, request.user.id);
    const granted = current.sheet.levels_granted;
    if (store.getSettings(a.cid).level_up === 'dm' && !granted) throw new AuthError('Your DM gives out levels in this campaign: you can level up once they give you one.', 403);
    const edition = await editions.of(a.cid);
    const choice = { class: body.class, new_class: body.new_class, subclass: body.subclass, asi: body.asi, feat: body.feat };
    const take = (hp) => {
      try {
        return levelUp(current.sheet, { ...choice, hp }, { edition });
      } catch (err) {
        if (err instanceof LevelUpError) throw new BadRequestError(err.message);
        throw err;
      }
    };
    // Checked before anything is rolled, so a choice that can't be taken rolls nothing.
    const { entry: planned } = take(null);
    const rolled = body.hp === 'roll' ? rolls.roll(a.cid, request.user.id, { notation: `1d${planned.die}`, label: `Hit points for a new level (d${planned.die})`, visibility: body.visibility }) : null;
    const done = rolled ? take(rolled.total) : take(null);
    const { sheet, gained, entry } = done;
    sheet.levels_granted = Math.max(0, granted - 1);
    const name = sheet.classes.find((c) => levelClass(c.name) === entry.class)?.name.trim() ?? entry.class;
    const saved = sheets.save(a.cid, request.user.id, sheet, {
      reason: `levelled up: ${name} ${entry.level} (${entry.hp != null ? `rolled ${entry.hp} on the d${entry.die}` : 'average hit points'}, +${gained} maximum hit points)`,
      levels: true,
    });
    return { ...(rolled ?? {}), gained, entry, ...saved };
  });
}
