{
  description = "Even Realities G2 smart glasses dev environment";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import inputs.nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.bun
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
              echo "node_modules/ not found. Run 'bun install' to get started."
            fi
          '';
        };
      }
    );
}
