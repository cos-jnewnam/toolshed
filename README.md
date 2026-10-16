# Toolshed

Static site on GitHub Pages. Pulls public gists from `cos-jnewnam` once a day and makes them searchable by keyword. Also lists anything you add by hand to `data/extras.json`.

## Setup

1. Create a repo named `toolshed` under `cos-jnewnam` and push these files to `main`.
2. In the repo, go to Settings > Pages and set Source to **GitHub Actions**.
3. Go to the Actions tab and run **Sync gists and deploy** once. After that it runs daily at about 4:17 AM Phoenix time and on every push to `main`.

If the repo name is not `toolshed`, change `REPO` at the top of `assets/app.js`.

## How gists show up

The sync script reads each gist description.

- Words starting with `#` become tags. The rest of the description becomes the title.
- `#prompt`, `#cli` and `#snippet` drive the Prompts, CLI and Snippets filters. `#prompts`, `#snippets`, `#cmd`, `#command`, `#commands`, `#terminal` and `#shell` are mapped to those.
- `#hidden` keeps a gist off the site.

Example description: `Sitefinity upgrade checklist prompt #prompt #sitefinity`

Search covers title, tags, description, file names, and file content.

## Non-gist items

Add entries to `data/extras.json`. Each needs `title`, `url`, and `tags`. `description` is optional.

## Sync now button

The footer link opens the workflow page in GitHub. Click **Run workflow** there. This needs you to be signed in with write access, which is the safe way to do it because a token in client-side JS would be public.

## Local preview

```
node scripts/sync-gists.mjs
npx serve .
```

`data/gists.json` is generated and ignored by git. The Action builds it fresh on every deploy.

## Third-party code

Fuse.js 7 is vendored in `assets/vendor/` under the Apache 2.0 license.
