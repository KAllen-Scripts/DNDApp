/**
 * The example data's login (DATA_SET=example): instead of a name and password, pick who to log
 * in as from a list. On the real data the server lists no one, so the normal login form stays.
 */
import { api } from './api.js';
import { h } from './dom.js';

/** What an account plays, for its line in the list: "test-mags (Wren)", "test-rowan (DM)". */
const label = (a) => {
  const plays = a.is_admin ? ['server admin'] : a.plays;
  return plays.length ? `${a.name} (${plays.join(', ')})` : a.name;
};

/** Switch the login form to the picker if the server is on the example data. */
export async function offerPickLogin(form) {
  const accounts = await api('GET', '/login/pick').then((r) => r.accounts, () => []);
  const on = accounts.length > 0;
  for (const el of form.querySelectorAll('.password-login')) el.hidden = on;
  for (const el of form.querySelectorAll('.pick-login')) el.hidden = !on;
  // Disabled fields are skipped by the browser's "required" check, so the hidden ones don't block logging in.
  form.name.disabled = form.password.disabled = on;
  form.pick.disabled = !on;
  if (!on) return;
  const chosen = form.pick.value;
  form.pick.replaceChildren(...accounts.map((a) => h('option', { value: a.name }, label(a))));
  if (chosen) form.pick.value = chosen;
  form.pick.focus();
}

/** Whether the login form is showing the picker. */
export const picking = (form) => !form.pick.disabled;
