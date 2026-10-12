type SessionUser = { email: string; name: string };

let current: SessionUser | null = null;

export function signInAs(email: string) {
  current = { email, name: email.split("@")[0] };
}

export function signOut() {
  current = null;
}

export function currentSessionUser() {
  return current;
}
