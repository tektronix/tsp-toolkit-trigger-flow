const path = require("path")
const os = require("os")

const EXTENSION = (() =>{
    if (os.platform() === "win32") {
        return `.exe`
    } else {
        return ""
    }
})()

const TRIGGER_FLOW_PATH = path.join(__dirname, "bin")

const TRIGGER_FLOW_NAME = `kic-script-gen${EXTENSION}`
const TRIGGER_FLOW_EXECUTABLE = path.join(TRIGGER_FLOW_PATH, TRIGGER_FLOW_NAME)

module.exports = {
    TRIGGER_FLOW_NAME,
    TRIGGER_FLOW_PATH,
    TRIGGER_FLOW_EXECUTABLE,
}
