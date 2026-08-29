# Security Policy

## Reporting a security issue

Do not include credentials, access tokens, private keys, personal data, or other sensitive information in a public GitHub issue.

If a vulnerability involves a secret that has already been committed, revoke or rotate that secret first. Removing it from the latest commit is not sufficient because Git history may still contain the value.

## Repository hygiene

Before making this repository public:

- keep `.env*`, `.dev.vars*`, private keys, certificates, credential JSON, logs, and local runtime caches out of Git
- review Git history, not only the current `main` tree, for previously committed secrets
- treat deployment project identifiers as public identifiers, never as authentication credentials
- keep generated framework caches and vendored build artifacts out of source control unless they are intentionally distributed
- review third-party assets and packages under their own licenses

## Supported code

The actively maintained game implementation is the voxel game described in `README.md` and the `src/` runtime it references. Security reports should include the affected path and a minimal reproduction when possible, but should not include live credentials.
