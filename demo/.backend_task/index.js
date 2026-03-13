const web = require('akeno:web');
const app = web.getApp(__dirname + "/../..");
const nodePath = require('path');
const fs = require('fs');

// Script to copy compiled HTML for people who don't use Akeno
const copyLocation = "demo/compiled.html";
app.on("refreshed-cache", (file, entry) => {
    if(file.endsWith("index.html")) {
        if(copyLocation) {
            const postCompilePath = nodePath.join(app.path, copyLocation.replace("$FILE", nodePath.basename(file)).replace("$APP", app.basename));
            app.log("Post-compiled file being written to " + postCompilePath);

            fs.promises.writeFile(postCompilePath, entry[0][0].toString().replaceAll("/~", "..").replaceAll("extragon.localhost", "extragon.cloud"), (err) => {
                if(err) {
                    app.error("Failed to copy compiled file to " + postCompilePath + ": ", err)
                }
            });
        }
    }
    return;
});