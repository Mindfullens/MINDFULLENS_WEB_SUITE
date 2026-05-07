# DCP Profiles (drop-in)

Place generated DCP profiles in this folder with exact filenames:

- `AI_KM_PORTRA_400.dcp`
- `AI_KM_CINESTILL_800T.dcp`
- `AI_KM_FUJI_400H.dcp`

On plugin load, `PluginInit.lua` will try to copy missing files into:

- macOS: `~/Library/Application Support/Adobe/CameraRaw/CameraProfiles`
- Windows: `%AppData%/Adobe/CameraRaw/CameraProfiles`

You can also force it manually via:
- `File -> Plug-in Extras -> Install DCP Profiles (if available)`

After copying DCP files, restart Lightroom and run the plugin pipeline.
