# GitHub Pages deployment

The React app is built and deployed by `.github/workflows/deploy-pages.yml` on pushes to `main`.
Pages must use **GitHub Actions** as its publishing source, rather than publishing raw source files.

Site: https://tyron40.github.io/Elite-Item-Listing-System/#recovery

The workflow builds with the existing Supabase project URL and public browser anon key.
These values identify the project; they are not service credentials. Never add a service-role key to Vite or a Pages artifact.
The backend and device endpoint remain on Supabase, independently of the frontend host.
Existing users can sign in with their account; sessions are separate for each browser origin.

Relative Vite assets and helper download links support the repository subdirectory.
Use the hash navigation URL above; there is no server-side router on Pages.
The graphical ISO pinned in the recovery catalog is build 6, SHA-256
`5ea522a80a299de3deb3533f84ae92384c45aa66a4d6ad6dc17aa777838a333f`.
It passed graphical startup and virtual BIOS/UEFI boot checks. This is not an OS installer.
Build 6 may display the older website address in its pairing window; use the GitHub Pages site above.
The downloadable desktop helper displays the new address. Python 3 and Tk remain required on installed systems.

GitHub Pages hosts the dashboard and companion source archive. Large boot images remain GitHub Release assets.
Windows, macOS and ChromeOS factory recovery images still require compatible official media; automatic factory reset is not implemented.
