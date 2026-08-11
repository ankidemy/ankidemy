{
  description = "Ankidemy local development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              docker-client
              docker-compose
              gnumake
            ];

            shellHook = ''
              if [ ! -e .env ] && [ -f .env.example ]; then
                install -m 600 .env.example .env
                echo "Created .env from .env.example; edit it to customize local settings."
              fi

              echo "Ankidemy dev shell ready. Run: make dev"
              if ! docker info >/dev/null 2>&1; then
                echo "Note: start your host Docker daemon before running make dev."
              fi
            '';
          };
        });
    };
}
