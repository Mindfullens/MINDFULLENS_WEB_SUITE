local LrPathUtils = import "LrPathUtils"

_G.ML_TOOLS_TARGET = "lab"
dofile(LrPathUtils.child(_PLUGIN.path, "ToolsMenu.lua"))
