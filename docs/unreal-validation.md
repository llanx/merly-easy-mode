# Unreal Validation

Optional helper for running a project-specific Unreal Automation test after Merly-guided edits.

This helper is not required for Merly Easy Mode. Use it only when the target repository has Unreal automation tests and the user has supplied the project path and test filter.

## Command

From `mcp-server/`:

```powershell
npm run unreal:automation -- --dry-run --project <path-to-project.uproject> --test <Automation.Test.Filter>
npm run unreal:automation -- --project <path-to-project.uproject> --test <Automation.Test.Filter>
```

The generated command follows this shape:

```text
UnrealEditor-Cmd.exe <project>.uproject -unattended -nop4 -nosplash -NoSound -NullRHI -ExecCmds="Automation RunTests <Automation.Test.Filter>; Quit" -TestExit="Automation Test Queue Empty" -stdout -FullStdOutLogOutput -AbsLog=<log>
```

## Configuration

Set `UNREAL_EDITOR_CMD` when `UnrealEditor-Cmd.exe` is not on `PATH` or under a standard Epic Games install directory:

```powershell
$env:UNREAL_EDITOR_CMD = "C:\Path\To\UnrealEditor-Cmd.exe"
```

Optional overrides:

```powershell
$env:UNREAL_PROJECT_PATH = "<path-to-project.uproject>"
$env:UNREAL_AUTOMATION_TEST = "<Automation.Test.Filter>"
$env:UNREAL_AUTOMATION_TIMEOUT_MS = "1200000"
```

## Guarded Repair Use

For each guarded Merly repair:

1. Run the narrow repo validation through this wrapper when the changed code has an Unreal automation test.
2. If the wrapper cannot find Unreal, run `--dry-run` and report the generated command plus the missing `UNREAL_EDITOR_CMD` setup.
3. Continue to run `merly_verify_file` on the changed line range after local validation.
