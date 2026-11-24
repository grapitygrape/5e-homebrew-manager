// Settings fall back to HBM_* env vars, so a developer's own shell (say
// HBM_FOUNDRY_HOMEBREW) leaks into tests that expect "nothing configured".
// Tests that need env values pass them in explicitly.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('HBM_')) delete process.env[key];
}
