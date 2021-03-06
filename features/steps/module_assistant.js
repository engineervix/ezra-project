/* This file is part of Ezra Project.

   Copyright (C) 2019 - 2021 Tobias Klein <contact@ezra-project.net>

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

const { Given, When, Then } = require("cucumber");
const { assert } = require("chai");

async function clickCheckbox(selector, parentSelector='#module-settings-assistant-add') {
  var parent = await global.app.client.$(parentSelector);
  var label = await parent.$(selector);
  await global.app.client.waitUntil(async () => { return await label.isExisting(); }, { timeout: 40000 });
  var checkbox = await label.$('../child::input');
  await checkbox.click();
}

async function getNavLinks(moduleSettingsDialogId='#module-settings-assistant-add') {
  var moduleSettingsAssistantAdd = await global.app.client.$(moduleSettingsDialogId);
  var actionsDiv = await moduleSettingsAssistantAdd.$('.actions');
  var navLinks = await actionsDiv.$$('a');
  return navLinks;
}

async function clickNext(moduleSettingsDialogId='#module-settings-assistant-add') {
  var navLinks = await getNavLinks(moduleSettingsDialogId);
  var nextButton = navLinks[1];
  await nextButton.click();
}

Given('I open the module installation assistant', {timeout: 40 * 1000}, async function () {
  var verseListTabs = await global.app.client.$('#verse-list-tabs-1');
  var displayOptionsButton = await verseListTabs.$('.display-options-button');
  var translationSettingsButton = await global.app.client.$('#show-translation-settings-button');

  await displayOptionsButton.click();
  await spectronHelper.sleep(200);
  await translationSettingsButton.click();
  await spectronHelper.sleep(200);
});

Given('I choose to add translations', async function () {
  var addModulesButton = await global.app.client.$('#add-modules-button');
  await addModulesButton.click();
});

Given('I choose to remove translations', async function () {
  var removeModulesButton = await global.app.client.$('#remove-modules-button');
  await removeModulesButton.click();
});

Given('I select the CrossWire repository', {timeout: 40 * 1000}, async function () {
  await clickCheckbox('#CrossWire');
  await clickNext();
});

Given('I select the English language', {timeout: 40 * 1000}, async function () {
  await clickCheckbox('#en');
  await clickNext();
});

Given('I select the ASV module for installation', {timeout: 40 * 1000}, async function () {
  await clickCheckbox('#ASV');
  await clickNext();
});

Given('I select the ASV module for removal', {timeout: 40 * 1000}, async function () {
  await clickCheckbox('#ASV', '#module-settings-assistant-remove');
  await clickNext('#module-settings-assistant-remove');
});

async function finishOnceProcessCompleted(moduleSettingsDialogId='#module-settings-assistant-add') {

  var navLinks = await getNavLinks(moduleSettingsDialogId);
  var finishButton = navLinks[2];
  var finishButtonLi = await finishButton.$('..');

  await global.app.client.waitUntil(async () => {
    var finishbuttonLiClass = await finishButtonLi.getAttribute('class');
    return finishbuttonLiClass != 'disabled';
  }, { timeout: 120000 });

  await finishButton.click();
}

When('the installation is completed', {timeout: 100 * 1000}, async function () {
  await finishOnceProcessCompleted();
  await spectronHelper.backupSwordDir();
});

When('the removal is completed', {timeout: 5 * 1000}, async function () {
  await finishOnceProcessCompleted('#module-settings-assistant-remove');
});

Then('the ASV is available as a local module', async function () {
  var asvModule = await spectronHelper.getLocalModule('ASV');
  assert(asvModule != null, "Got null when checking for the ASV module!");
});

Then('the ASV is no longer available as a local module', async function () {
  var asvModule = await spectronHelper.getLocalModule('ASV');
  assert(asvModule == null, "ASV should no longer be available, but it is!");
});

Then('the ASV is selected as the current translation', async function () {
  var asvModule = await spectronHelper.getLocalModule('ASV');

  var verseListTabs = await global.app.client.$('#verse-list-tabs-1');
  var bibleSelectBlock = await verseListTabs.$('.bible-select-block');
  var selectMenuStatus = await bibleSelectBlock.$('.ui-selectmenu-status');
  var selectMenuStatusText = await selectMenuStatus.getText();

  await selectMenuStatusText.should.equal(asvModule.description);
});

Then('the relevant buttons in the menu are enabled', async function() {
  var verseListTabs = await global.app.client.$('#verse-list-tabs-1');
  var bookSelectButton = await verseListTabs.$('.book-select-button');
  var moduleSearchButton = await verseListTabs.$('.module-search-button');
  var appInfoButton = await verseListTabs.$('.app-info-button');
  await global.spectronHelper.buttonIsEnabled(bookSelectButton);
  await global.spectronHelper.buttonIsEnabled(moduleSearchButton);
  await global.spectronHelper.buttonIsEnabled(appInfoButton);
});
