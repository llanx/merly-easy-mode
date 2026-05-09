# Unreal Validation

Use this wrapper after Merly-guided edits to `DwarfIncremental` so Codex can run the same headless automation command consistently.

## Command

```powershell
cd C:\Users\matts\merly\merly-codex-integration\mcp-server
npm.cmd run unreal:automation -- --dry-run
npm.cmd run unreal:automation
```

Default target:

```text
C:\Users\matts\DwarfIncremental\DwarfIncremental.uproject
```

Default automation filter:

```text
DwarfIncremental.GridNav.NavigationSubsystemSmoke
```

The generated Unreal command mirrors the command recorded in the existing `GridNavigationSubsystemAutomation.log`:

```text
UnrealEditor-Cmd.exe <project>.uproject -unattended -nop4 -nosplash -NoSound -NullRHI -ExecCmds="Automation RunTests DwarfIncremental.GridNav.NavigationSubsystemSmoke; Quit" -TestExit="Automation Test Queue Empty" -stdout -FullStdOutLogOutput -AbsLog=<log>
```

## Configuration

Set `UNREAL_EDITOR_CMD` when `UnrealEditor-Cmd.exe` is not on `PATH` or under a standard Epic Games install directory:

```powershell
$env:UNREAL_EDITOR_CMD = "C:\Path\To\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
```

Optional overrides:

```powershell
$env:UNREAL_PROJECT_PATH = "C:\Users\matts\DwarfIncremental\DwarfIncremental.uproject"
$env:UNREAL_AUTOMATION_TEST = "DwarfIncremental.GridNav.NavigationSubsystemSmoke"
$env:UNREAL_AUTOMATION_TIMEOUT_MS = "1200000"
```

Or pass flags directly:

```powershell
npm.cmd run unreal:automation -- --project C:\Users\matts\DwarfIncremental\DwarfIncremental.uproject --test DwarfIncremental.GridNav.NavigationSubsystemSmoke --log C:\Users\matts\DwarfIncremental\Saved\Logs\GridNavigationSubsystemAutomation.log
```

## Guarded Repair Use

For each guarded Merly repair:

1. Run the narrow repo validation through this wrapper when the changed code has an Unreal automation test.
2. If the wrapper cannot find Unreal, run `--dry-run` and report the generated command plus the missing `UNREAL_EDITOR_CMD` setup.
3. Continue to run `merly_verify_file` on the changed line range after local validation.
