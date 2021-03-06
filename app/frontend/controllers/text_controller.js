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

const PlatformHelper = require('../../lib/platform_helper.js');

/**
 * The TextController is used to load bible text into the text area of a tab.
 * It can handle bible books, tagged verse lists and search results.
 * 
 * Like all other controllers it is only initialized once. It is accessible at the
 * global object `app_controller.text_controller`.
 * 
 * @category Controller
 */
class TextController {
  constructor() {
    loadScript("app/templates/verse_list.js");
    this.marked = require("marked");
    this.platformHelper = new PlatformHelper();
  }

  async prepareForNewText(resetView, isSearch=false, tabIndex=undefined) {
    app_controller.module_search_controller.hideModuleSearchHeader(tabIndex);
    await app_controller.navigation_pane.initNavigationPaneForCurrentView(tabIndex);

    if (tabIndex === undefined) {
      if (app_controller.verse_selection != null) {
        app_controller.verse_selection.clear_verse_selection();
      }
    }

    var textType = app_controller.tab_controller.getTab(tabIndex).getTextType();    
    if (textType != 'book') {
      app_controller.book_selection_menu.clearSelectedBookInMenu();
    }

    if (resetView && (tabIndex == 0 || tabIndex == undefined)) {
      app_controller.resetVerseListView();
      var loadingMessage = "";

      if (isSearch) {
        var currentTab = app_controller.tab_controller.getTab(tabIndex);
        var searchTerm = currentTab.getSearchTerm();
        loadingMessage = i18n.t("bible-browser.searching-for") + " <i>" + searchTerm + "</i>";
      } else {
        loadingMessage = i18n.t("bible-browser.loading-bible-text");
      }

      app_controller.showVerseListLoadingIndicator(loadingMessage, !isSearch /* Only show loader visualization if we are not searching */ );
      app_controller.translation_controller.showTextLoadingIndicator();
    }

    var temporary_help = app_controller.getCurrentVerseListComposite(tabIndex).find('.temporary-help, .help-text');
    temporary_help.hide();
  }

  async requestTextUpdate(tabId,
                          book,
                          tagIdList,
                          cachedText,
                          cachedReferenceVerse,
                          searchResults,
                          xrefs,
                          tabIndex=undefined,
                          requestedBookId=-1,
                          target=undefined) {

    var textType = app_controller.tab_controller.getTab(tabIndex).getTextType();
    var currentVerseListMenu = app_controller.getCurrentVerseListMenu(tabIndex);
    var buttons = currentVerseListMenu.find('.fg-button');
    buttons.removeClass('focused-button');

    if (cachedText != null) {
      console.log("Loading text for tab " + tabIndex + " from cache!");
    }

    if (textType == 'book') { // Book text mode
      if (tabIndex === undefined) { $('#export-tagged-verses-button').addClass('ui-state-disabled'); }
      currentVerseListMenu.find('.book-select-button').addClass('focused-button');

      if (cachedText != null) {
        await this.renderVerseList(cachedText, cachedReferenceVerse, 'book', tabIndex, true);
      } else {

        // 1) Only request the first 50 verses and render immediately
        await this.requestBookText(tabIndex, tabId, book,
          async (htmlVerseList) => { 
            await this.renderVerseList(htmlVerseList, null, 'book', tabIndex, false);
          }, 1, 50
        );

        await waitUntilIdle();

        // 2) Now request the rest of the book
        await this.requestBookText(
          tabIndex, tabId, book,
          async (htmlVerseList) => { 
            await this.renderVerseList(htmlVerseList, null, 'book', tabIndex, false, undefined, true);
          }, 51, -1
        );
      }

    } else if (textType == 'tagged_verses') { // Tagged verse list mode
      if (tabIndex === undefined) { $('.show-book-tag-statistics-button').addClass('ui-state-disabled'); }
      currentVerseListMenu.find('.tag-select-button').addClass('focused-button');

      app_controller.translation_controller.showTextLoadingIndicator();

      if (cachedText != null) {
        await this.renderVerseList(cachedText, cachedReferenceVerse, 'tagged_verses', tabIndex);
      } else {
        await this.requestVersesForSelectedTags(
          tabIndex,
          tabId,
          tagIdList,
          async (htmlVerseList) => {
            await this.renderVerseList(htmlVerseList, null, 'tagged_verses', tabIndex);
          }
        );
      }

    } else if (textType == 'search_results') { // Search result mode
      if (tabIndex === undefined) { $('.show-book-tag-statistics-button').addClass('ui-state-disabled'); }
      currentVerseListMenu.find('.module-search-button').addClass('focused-button');
      
      if (cachedText != null) {
        await this.renderVerseList(cachedText, null, 'search_results', tabIndex);
      } else {
        await this.requestVersesForSearchResults(
          tabIndex,
          tabId,
          searchResults,
          async (htmlVerseList) => {
            await this.renderVerseList(htmlVerseList, null, 'search_results', tabIndex, /* isCache */ false, target);
          },
          requestedBookId
        );
      }
    } else if (textType == 'xrefs') {

      app_controller.translation_controller.showTextLoadingIndicator();
      
      if (cachedText != null) {
        await this.renderVerseList(cachedText, cachedReferenceVerse, 'xrefs', tabIndex);
      } else {
        await this.requestVersesForXrefs(
          tabIndex,
          tabId,
          xrefs,
          async (htmlVerseList) => {
            await this.renderVerseList(htmlVerseList, null, 'xrefs', tabIndex, /* isCache */ false, target);
          }
        );
      }
    }
  }

  async requestBookText(tab_index,
                        current_tab_id,
                        book_short_title,
                        render_function,
                        start_verse_number=-1,
                        number_of_verses=-1) {

    var currentBibleTranslationId = app_controller.tab_controller.getTab(tab_index).getBibleTranslationId();
    var localSwordModule = null;

    try {
      localSwordModule = await ipcNsi.getLocalModule(currentBibleTranslationId);
    } catch (e) {
      console.log("ERROR: Could not get local Sword module for " + currentBibleTranslationId);
    }

    if (currentBibleTranslationId == null || 
        currentBibleTranslationId == "" ||
        localSwordModule == null) {

      $('#verse-list-loading-indicator').hide();
      return;
    }

    var versification = (await app_controller.translation_controller.getVersification(currentBibleTranslationId) == 'ENGLISH' ? 'eng' : 'heb');
    var bibleBook = await ipcDb.getBibleBook(book_short_title);

    // Only necessary because old saved short titles may not be found directly
    if (bibleBook == null) {
      book_short_title = await ipcDb.findBookTitle(book_short_title);
      bibleBook = await ipcDb.getBibleBook(book_short_title);
    }

    if (bibleBook == null) {
      // If the bibleBook is still null at this point we simply return.
      $('#verse-list-loading-indicator').hide();
      return;
    }
    
    var verses = await ipcNsi.getBookText(currentBibleTranslationId, book_short_title, start_verse_number, number_of_verses);
    if (verses == null) {
      console.error("Got null result when requesting book text!");
      return;
    }

    var verseTags = await ipcDb.getBookVerseTags(bibleBook.id, versification);
    var verseNotes = await ipcDb.getVerseNotesByBook(bibleBook.id, versification);

    var moduleLang = i18n.language;
    if (localSwordModule != null) {
      var moduleLang = localSwordModule.language;
    }

    var chapterText = await i18nHelper.getChapterTranslation(moduleLang);
    if (book_short_title == 'Ps') {
      chapterText = await i18nHelper.getPsalmTranslation(moduleLang);
    }

    var bookIntroduction = null;

    if (start_verse_number == 1) { // Only load book introduction if starting with verse 1
      try {        
        if (localSwordModule != null && localSwordModule.hasHeadings) {
          bookIntroduction = await ipcNsi.getBookIntroduction(currentBibleTranslationId, book_short_title);

          var sanitizeHtml = require('sanitize-html');
          bookIntroduction = sanitizeHtml(bookIntroduction);
        }
      } catch (e) {
        console.log("Could not retrieve book introduction for module " + currentBibleTranslationId);
      }
    }
    
    var bookNotes = null;

    if (start_verse_number == 1) {
      bookNotes = await ipcDb.getBookNotes(book_short_title);
    }

    var verses_as_html = verseListTemplate({
      versification: versification,
      verseListId: current_tab_id,
      renderVerseMetaInfo: true,
      renderBibleBookHeaders: false,
      // only render chapter headers with the full book requested
      renderChapterHeaders: (start_verse_number == -1),
      renderBookNotes: (start_verse_number == 1),
      bookIntroduction: bookIntroduction,
      bookNotes: bookNotes,
      bibleBooks: [bibleBook],
      verses: verses,
      verseTags: verseTags,
      verseNotes: verseNotes,
      marked: this.marked,
      reference_separator: reference_separator,
      saveText: i18n.t("general.save"),
      cancelText: i18n.t("general.cancel"),
      chapterText: chapterText,
      tagHint: i18n.t("bible-browser.tag-hint")
    });

    render_function(verses_as_html);
  }

  getBibleBookStatsFromVerses(verses) {
    var bibleBookStats = {};

    for (var i = 0; i < verses.length; i++) {
      if (verses[i] === undefined) {
        continue;
      }

      var bibleBookShortTitle = verses[i].bibleBookShortTitle;
      
      if (bibleBookStats[bibleBookShortTitle] === undefined) {
        bibleBookStats[bibleBookShortTitle] = 1;
      } else {
        bibleBookStats[bibleBookShortTitle] += 1;
      }
    }

    return bibleBookStats;
  }

  getBibleTranslationId(tab_index) {
    var bibleTranslationId = null;
        
    if (app_controller.tab_controller.getTab(tab_index).getBibleTranslationId() == null) {
      bibleTranslationId = app_controller.tab_controller.defaultBibleTranslationId;
    } else {
      bibleTranslationId = app_controller.tab_controller.getTab(tab_index).getBibleTranslationId();
    }

    return bibleTranslationId;
  }

  async requestVersesForSearchResults(tab_index,
                                      current_tab_id,
                                      search_results,
                                      render_function,
                                      requestedBookId=-1,
                                      render_type='html',
                                      renderVerseMetaInfo=true) {
    if (search_results.length == 0) {
      return;
    }

    var bibleTranslationId = this.getBibleTranslationId(tab_index);
    var versification = (await app_controller.translation_controller.getVersification(bibleTranslationId) == 'ENGLISH' ? 'eng' : 'heb');

    var bibleBooks = await ipcDb.getBibleBooksFromSearchResults(search_results);
    var bookNames = await ipcGeneral.getBookNames(bibleBooks);
    var bibleBookStats = app_controller.module_search_controller.getBibleBookStatsFromSearchResults(search_results);
    var verses = [];

    for (var i = 0; i < search_results.length; i++) {
      var currentVerse = search_results[i];
      var currentBookId = currentVerse.bibleBookShortTitle;

      if (requestedBookId != -1 && currentBookId != requestedBookId) {
        // Skip the books that are not requested;
        continue;
      }

      verses.push(currentVerse);
    }

    var verseReferenceIds = [];
    for (var i = 0; i < verses.length; i++) {
      var currentVerse = verses[i];
      var currentVerseReferences = await ipcDb.getVerseReferencesByBookAndAbsoluteVerseNumber(currentVerse.bibleBookShortTitle,
                                                                                              currentVerse.absoluteVerseNr,
                                                                                              versification);
      if (currentVerseReferences.length > 0) {
        verseReferenceIds.push(currentVerseReferences[0].id);
      }
    }

    var verseTags = await ipcDb.getVerseTagsByVerseReferenceIds(verseReferenceIds, versification);
    var verseNotes = await ipcDb.getNotesByVerseReferenceIds(verseReferenceIds, versification);
    
    if (render_type == "html") {
      
      this.getVersesAsHtml(current_tab_id,
                           bibleBooks,
                           bookNames,
                           bibleBookStats,
                           verseTags,
                           verseNotes,
                           verses,
                           versification,
                           render_function,
                           requestedBookId <= 0,
                           renderVerseMetaInfo);
      
    } else if (render_type == "docx") {
      render_function(bibleBooks, groupedVerseTags, verses);
    }
  }

  async requestVersesForSelectedTags(tab_index,
                                     current_tab_id,
                                     selected_tags,
                                     render_function,
                                     render_type='html',
                                     renderVerseMetaInfo=true) {
    if (selected_tags == '') {
      return;
    }

    var bibleTranslationId = this.getBibleTranslationId(tab_index);
    var versification = (await app_controller.translation_controller.getVersification(bibleTranslationId) == 'ENGLISH' ? 'eng' : 'heb');

    var verseReferences = await ipcDb.getVerseReferencesByTagIds(selected_tags);
    var verseReferenceIds = [];
    var verses = [];

    for (var i = 0; i < verseReferences.length; i++) {
      var currentVerseReference = verseReferences[i];
      verseReferenceIds.push(currentVerseReference.id);

      var currentAbsoluteVerseNumber = versification == 'eng' ? currentVerseReference.absoluteVerseNrEng : currentVerseReference.absoluteVerseNrHeb;
      
      var resultVerses = await ipcNsi.getBookText(bibleTranslationId,
                                                  currentVerseReference.bibleBookShortTitle,
                                                  currentAbsoluteVerseNumber,
                                                  1)
      var verse = resultVerses[0];

      if (verse !== undefined) {
        verses.push(verse);
      }
    }

    var bibleBookStats = this.getBibleBookStatsFromVerses(verses);
    var bibleBooks = await ipcDb.getBibleBooksFromTagIds(selected_tags);
    var bookNames = await ipcGeneral.getBookNames(bibleBooks);

    var verseTags = await ipcDb.getVerseTagsByVerseReferenceIds(verseReferenceIds, versification);
    var verseNotes = await ipcDb.getNotesByVerseReferenceIds(verseReferenceIds, versification);

    if (render_type == "html") {
      
      this.getVersesAsHtml(current_tab_id,
                           bibleBooks,
                           bookNames,
                           bibleBookStats,
                           verseTags,
                           verseNotes,
                           verses,
                           versification,
                           render_function,
                           true,
                           renderVerseMetaInfo);
    
    } else if (render_type == "docx") {
      render_function(bibleBooks, verseTags, verses);
    }
  }

  async requestVersesForXrefs(tab_index,
                              current_tab_id,
                              xrefs,
                              render_function,
                              render_type='html',
                              renderVerseMetaInfo=true) {
    if (xrefs.length == 0) {
      return;
    }

    var bibleTranslationId = this.getBibleTranslationId(tab_index);
    var versification = (await app_controller.translation_controller.getVersification(bibleTranslationId) == 'ENGLISH' ? 'eng' : 'heb');

    var verseReferences = await ipcDb.getVerseReferencesByXrefs(xrefs);
    var verseReferenceIds = [];
    var verses = await ipcNsi.getVersesFromReferences(bibleTranslationId, xrefs);

    for (var i = 0; i < verseReferences.length; i++) {
      var currentVerseReference = verseReferences[i];
      
      if (currentVerseReference != undefined) {
        verseReferenceIds.push(currentVerseReference.id);
      }
    }

    var bibleBookStats = this.getBibleBookStatsFromVerses(verses);
    var bibleBooks = await ipcDb.getBibleBooksFromXrefs(xrefs);
    var bookNames = await ipcGeneral.getBookNames(bibleBooks);

    var verseTags = await ipcDb.getVerseTagsByVerseReferenceIds(verseReferenceIds, versification);
    var verseNotes = await ipcDb.getNotesByVerseReferenceIds(verseReferenceIds, versification);

    if (render_type == "html") {
      
      this.getVersesAsHtml(current_tab_id,
                           bibleBooks,
                           bookNames,
                           bibleBookStats,
                           verseTags,
                           verseNotes,
                           verses,
                           versification,
                           render_function,
                           true,
                           renderVerseMetaInfo);
    
    } else if (render_type == "docx") {
      render_function(bibleBooks, groupedVerseTags, verses);
    }
  }

  getVersesAsHtml(current_tab_id, bibleBooks, bookNames, bibleBookStats, groupedVerseTags, groupedVerseNotes, verses, versification, render_function, renderBibleBookHeaders=true, renderVerseMetaInfo=true) {
    var verses_as_html = verseListTemplate({
      versification: versification,
      verseListId: current_tab_id,
      renderBibleBookHeaders: renderBibleBookHeaders,
      renderVerseMetaInfo: renderVerseMetaInfo,
      bibleBooks: bibleBooks,
      bookNames: bookNames,
      bibleBookStats: bibleBookStats,
      verses: verses,
      verseTags: groupedVerseTags,
      verseNotes: groupedVerseNotes,
      marked: this.marked,
      reference_separator: reference_separator,
      saveText: i18n.t("general.save"),
      cancelText: i18n.t("general.cancel"),
      tagHint: i18n.t("bible-browser.tag-hint"),
      loadSearchResultsText: i18n.t("bible-browser.show-search-results")
    });

    render_function(verses_as_html, verses.length);
  }

  async renderVerseList(htmlVerseList, referenceVerseHtml, listType, tabIndex=undefined, isCache=false, target=undefined, append=false) {
    app_controller.hideVerseListLoadingIndicator();
    app_controller.hideSearchProgressBar();
    var initialRendering = true;

    if (tabIndex === undefined) {
      var tabIndex = app_controller.tab_controller.getSelectedTabIndex();
      initialRendering = false;
    }

    if (!initialRendering) {
      app_controller.tab_controller.getTab().setTextType(listType);
    }

    if (target === undefined) {
      //console.log("Undefined target. Getting verse list target based on tabIndex " + tabIndex);
      target = app_controller.getCurrentVerseList(tabIndex);
    }

    if (listType == 'book') {
      app_controller.tag_selection_menu.resetTagMenu();
      app_controller.module_search_controller.resetSearch(tabIndex);

      target.addClass('verse-list-book');

    } else if (listType == 'tagged_verses') {

      app_controller.module_search_controller.resetSearch(tabIndex);

      if (this.platformHelper.isElectron()) {
        app_controller.taggedVerseExport.enableTaggedVersesExportButton(tabIndex);
      }

      target.removeClass('verse-list-book');

    } else if (listType == 'search_results') {

      //console.log("Rendering search results verse list on tab " + tabIndex);
      target.removeClass('verse-list-book');
    }

    if (listType == 'xrefs' || listType == 'tagged_verses') {
      app_controller.showReferenceContainer();
    }

    if (append) {
      htmlVerseList = target[0].innerHTML + htmlVerseList;
    }

    target.html(htmlVerseList);

    if (referenceVerseHtml != null) {
      var verseListFrame = app_controller.getCurrentVerseListFrame(tabIndex);
      var referenceVerseContainer = verseListFrame.find('.reference-verse');
      referenceVerseContainer.html(referenceVerseHtml);
      var referenceVerseBox = referenceVerseContainer.find('.verse-box');
      app_controller.renderReferenceVerse(referenceVerseBox, tabIndex);
      referenceVerseContainer.show();
    }

    if (listType == 'search_results') {
      var currentTab = app_controller.tab_controller.getTab(tabIndex);
      var currentSearchTerm = currentTab.getSearchTerm();
      app_controller.module_search_controller.highlightSearchResults(currentSearchTerm, tabIndex);
    }

    if (isCache || listType == 'book' && !append) {
      app_controller.optionsMenu.showOrHideBookIntroductionBasedOnOption(tabIndex);
      app_controller.optionsMenu.showOrHideSectionTitlesBasedOnOption(tabIndex);
    }

    if (isCache ||
        listType != 'book' ||
        listType == 'book' && append) {

      app_controller.optionsMenu.showOrHideSectionTitlesBasedOnOption(tabIndex);
      await app_controller.initApplicationForVerseList(tabIndex);      
      app_controller.translation_controller.hideTextLoadingIndicator();
    }
  }
}

module.exports = TextController;

