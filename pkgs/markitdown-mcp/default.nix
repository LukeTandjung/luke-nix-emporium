{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

python3Packages.buildPythonApplication {
  pname = "markitdown-mcp";
  version = "0.1.5";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "microsoft";
    repo = "markitdown";
    tag = "v0.1.5";
    hash = "sha256-sqWfft/yaI/0FavhIbAHqltgVfTNk0GJk/phyvdn7Ck=";
  };

  sourceRoot = "source/packages/markitdown-mcp";

  build-system = [ python3Packages.hatchling ];

  pythonRelaxDeps = [ "mcp" ];

  dependencies = with python3Packages; [
    markitdown
    mcp
  ];

  # Autolith carries an OpenSSL LD_LIBRARY_PATH that is incompatible with
  # Python packages built by this nixpkgs revision.
  makeWrapperArgs = [ "--unset" "LD_LIBRARY_PATH" ];
  pythonImportsCheck = [ "markitdown_mcp" ];

  meta = {
    description = "MCP server for Microsoft MarkItDown";
    homepage = "https://github.com/microsoft/markitdown/tree/main/packages/markitdown-mcp";
    license = lib.licenses.mit;
    mainProgram = "markitdown-mcp";
    platforms = lib.platforms.all;
  };
}
