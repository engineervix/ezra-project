/* This file is part of Ezra Project.

   Copyright (C) 2019 - 2020 Tobias Klein <contact@ezra-project.net>

   Ezra Project is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 2 of the License, or
   (at your option) any later version.

   Ezra Project is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with Ezra Project. See the file LICENSE.
   If not, see <http://www.gnu.org/licenses/>. */

const path = require('path');
const Application = require('spectron').Application;
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
const assert = require('chai').assert;
const VerseReferenceHelper = require('../../app/helpers/verse_reference_helper.js');
const copydir = require('copy-dir');
const fs = require('fs');
require('../../app/database/models/biblebook.js');

class SpectronHelper {
  constructor() {
    this.app = null;
    this.nsi = null;
  }

  initializeSpectron() {
    let xvfbMaybePath = path.join(__dirname, "../../node_modules", ".bin", "xvfb-maybe");
    let electronPath = path.join(__dirname, "../../node_modules", ".bin", "electron");
    const appPath = path.join(__dirname, "../../");
    if (process.platform === "win32") {
        electronPath += ".cmd";
    }

    return new Application({
        path: xvfbMaybePath,
        args: [electronPath, appPath],
        env: {
            ELECTRON_ENABLE_LOGGING: true,
            ELECTRON_ENABLE_STACK_DUMPING: true,
            NODE_ENV: "development"
        },
        startTimeout: 20000,
        chromeDriverLogPath: '../chromedriverlog.txt'
    });
  }

  initAndGetApp() {
    if (this.app == null) {
      chai.should();
      chai.use(chaiAsPromised);
      this.app = this.initializeSpectron();
    }

    return this.app;
  }

  async getUserDataDir() {
    var electronApp = this.app.electron.remote.app;
    var userDataDir = await electronApp.getPath('userData');
    return userDataDir;
  }

  async getNSI(refresh=false) {
    if (this.nsi == null || refresh) {
      const NodeSwordInterface = require('node-sword-interface');
      var userDataDir = await this.getUserDataDir();
      this.nsi = new NodeSwordInterface(userDataDir);
    }

    return this.nsi;
  }

  async getVerseReferenceHelper() {
    var nsi = await this.getNSI();
    var verseReferenceHelper = new VerseReferenceHelper(':', nsi);
    return verseReferenceHelper;
  }

  async initDatabase() {
    var userDataDir = await this.getUserDataDir();
    global.models = require('../../app/database/models')(userDataDir);
  }

  async buttonHasClass(button, className, timeoutMs=100) {
    await global.app.client.waitUntil(async () => {
      var classList = await button.getAttribute('class');
      return classList.split(' ').includes(className);
    }, { timeout: timeoutMs });
  }

  async buttonIsDisabled(button, timeoutMs=100) {
    await this.buttonHasClass(button, 'ui-state-disabled', timeoutMs);
  }

  async buttonIsEnabled(button, timeoutMs=100) {
    await this.buttonHasClass(button, 'ui-state-default', timeoutMs);
  }

  async waitUntilGlobalLoaderIsHidden(timeoutMs=20000) {
    var verseListMenu = await global.app.client.$('.verse-list-menu-line1');
    var loader = await verseListMenu.$('.loader');
  
    await global.app.client.waitUntil(async () => { // Wait until loader is hidden
      var loaderDisplay = await loader.getCSSProperty('display');
      await global.app.client.saveScreenshot('./test_screenshot.png');
      await this.sleep(200);
  
      return loaderDisplay.value == "none";
    }, { timeout: timeoutMs, timeoutMsg: `The loader has not disappeared after waiting ${timeoutMs}ms.` });
  }

  getBookShortTitle(book_long_title) {
    for (var i = 0; i < bible_books.length; i++) {
      var current_book = bible_books[i];
      if (current_book.long_title == book_long_title) {
        return current_book.short_title;
      }
    }

    return -1;
  };

  async isKjvAvailable(refreshNsi=false) {
    const nsi = await this.getNSI(refreshNsi);
    var allLocalModules = nsi.getAllLocalModules();
    var kjvFound = false;
  
    allLocalModules.forEach((module) => {
      if (module.name == 'KJV') kjvFound = true;
    });
  
    return kjvFound;
  }

  async backupSwordDir() {
    var userDataDir = await this.getUserDataDir();
    var swordDir = userDataDir + '/.sword';
    var backupSwordDir = userDataDir + '/.swordBackup';

    copydir.sync(swordDir, backupSwordDir);
  }

  async installKJV() {
    var userDataDir = await this.getUserDataDir();
    var swordDir = userDataDir + '/.sword';
    var backupSwordDir = userDataDir + '/.swordBackup';

    if (fs.existsSync(backupSwordDir)) {
      copydir.sync(backupSwordDir, swordDir);
      await this.sleep(500);
    }

    var kjvFound = await this.isKjvAvailable(true);

    if (!kjvFound) {
      const nsi = await this.getNSI(true);
      await nsi.updateRepositoryConfig();
      await nsi.installModule(undefined, 'KJV');

      var kjvAvailable = await this.isKjvAvailable();
      assert(kjvAvailable);

      await this.backupSwordDir();
    }

    await global.app.webContents.executeJavaScript("nsi.refreshLocalModules()");  
    await spectronHelper.sleep(500);
    await global.app.webContents.executeJavaScript("app_controller.translation_controller.initTranslationsMenu()");    
    await spectronHelper.sleep(500);
    await global.app.webContents.executeJavaScript("app_controller.updateUiAfterBibleTranslationAvailable('KJV')");
    await spectronHelper.sleep(500);
  }

  sleep(time) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, time);
    });
  }
}

module.exports = SpectronHelper;