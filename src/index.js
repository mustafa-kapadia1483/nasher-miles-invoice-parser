const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
  webContents,
} = require("electron");
const path = require("path");

const parsePdfData = require("./utils/parsePdfData");
const updateGoogleSheets = require("./utils/googleSpreadsheetUtils");
const secrets = require("../secrets.json");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Code to show dialog box for uploading pdf
ipcMain.handle("showDialog", async () => {
  const result = await dialog.showOpenDialog({
    buttonLabel: "Upload PDF",
    filters: [
      {
        name: "PDFs",
        extensions: ["pdf"],
      },
    ],
    properties: ["openFile", "dontAddToRecent", "multiSelections"],
  });

  return result;
});

ipcMain.handle("parsePdfData", async (e, pdfFilePaths) => {
  const result = [];
  for (let pdfFilePath of pdfFilePaths) {
    let extractedData = await parsePdfData(pdfFilePath);
    console.log({ extractedData });
    if (typeof extractedData == "string") {
      new Notification({ title: "Parsing Failed", body: extractedData }).show();
    } else {
      result.push(...extractedData);
    }
  }
  return result;
});

ipcMain.handle(
  "updateGoogleSheets",
  async (e, googleSpreadsheetId, sheetName, extractedData) => {
    const result = await updateGoogleSheets(
      secrets,
      googleSpreadsheetId,
      sheetName,
      extractedData
    );
    return result;
  }
);
