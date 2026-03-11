{
  description = "Even Realities G2 smart glasses app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import inputs.nixpkgs { inherit system; };
        bun = pkgs.bun;
      in {

        # --- Dev shell ---
        devShells.default = pkgs.mkShell {
          buildInputs = [
            bun
            pkgs.nodePackages.typescript-language-server
          ];

          shellHook = ''
            echo ""
            echo "G2 Smart Glasses Dev Environment"
            echo "================================"
            echo "  bun run dev   — Vite dev server (0.0.0.0:5173)"
            echo "  bun run sim   — Dev server + simulator"
            echo "  bun run qr    — QR code for phone connection"
            echo "  bun run build — Production build"
            echo "  bun run pack  — Package for Even Hub"
            echo "  bun run check — TypeScript type-check"
            echo ""
            if [ ! -d node_modules ]; then
              echo "→ node_modules/ not found. Running 'bun install'..."
              ${bun}/bin/bun install
            fi
          '';
        };

        # --- Packages ---
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "g2-app";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = [ bun pkgs.cacert ];

          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile
            bunx vite build
          '';

          installPhase = ''
            cp -r dist $out
          '';
        };

        # --- Checks (CI) ---
        checks = {
          typecheck = pkgs.stdenv.mkDerivation {
            name = "g2-app-typecheck";
            src = ./.;
            nativeBuildInputs = [ bun pkgs.cacert ];
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --frozen-lockfile
              bunx tsc --noEmit
            '';
            installPhase = "mkdir -p $out && touch $out/ok";
          };

          build = pkgs.stdenv.mkDerivation {
            name = "g2-app-build";
            src = ./.;
            nativeBuildInputs = [ bun pkgs.cacert ];
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --frozen-lockfile
              bunx vite build
            '';
            installPhase = "cp -r dist $out";
          };
        };
      }
    );
}
