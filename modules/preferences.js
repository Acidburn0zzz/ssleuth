"use strict";

var EXPORTED_SYMBOLS = ["SSleuthPreferences",
              "ssleuthPrefListener"];

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://ssleuth/cipher-suites.js");

var ssleuthPanelInfo = {
  keyExchange: true,
  authAlg: true,
  bulkCipher: true,
  HMAC: true,
  certValidity: true,
  validityTime: false,
  certFingerprint: false
};

var ssleuthDefaultPrefs = {
  PREF_BRANCH: "extensions.ssleuth.",
  PREFS: {
    "notifier.location": 0,
    "panel.fontsize": 1,
    "ui.keyshortcut": "control shift }",
    "ui.urlbar.colorize": false,
    "ui.notifier.colorize" : true,
    "rating.params": ssleuthConnectionRating,
    "rating.ciphersuite.params": ssleuthCipherSuites.weighting,
    "suites.toggle": ffToggleDefault,
    "panel.info": ssleuthPanelInfo,
    "domains.observe": true
  }
};

var SSleuthPreferences = {
  prefBranch: ssleuthDefaultPrefs.PREF_BRANCH,
  prefService: null,

  init: function () {
    this.setDefaultPreferences();
    this.prefService =
      Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
  },

  uninit: function () {
    this.closeTab();
  },

  setDefaultPreferences: function () {
    let sp = ssleuthDefaultPrefs;
    let branch = Services.prefs.getDefaultBranch(sp.PREF_BRANCH);
    for (let [key, val] in Iterator(sp.PREFS)) {
      switch (typeof val) {
      case "boolean":
        branch.setBoolPref(key, val);
        break;
      case "number":
        branch.setIntPref(key, val);
        break;
      case "string":
        branch.setCharPref(key, val);
        break;
      case "object":
        branch.setCharPref(key, JSON.stringify(val));
      }
    }
  },

  openTab: function (index) {

    const win = Services.wm.getMostRecentWindow("navigator:browser");

    if (null == this.prefsTab || this.prefsTabWin.closed) {
      var prefsTab =
        win.gBrowser.loadOneTab(
          "chrome://ssleuth/content/preferences.xul", {
            inBackground: false
          });
      this.prefsTab = prefsTab;
      this.prefsTabWin = win;
      // TODO : Remove event listeners from inside
      prefsTab.addEventListener("TabClose", function () {
        SSleuthPreferences.prefsTab = null;
        SSleuthPreferences.prefsTabWin = null;
      }, false);
      win.addEventListener("unload", function winUnload() {
        if (SSleuthPreferences) {
          SSleuthPreferences.prefsTab = null;
          SSleuthPreferences.prefsTabWin = null;
        }
      }, false);
    } else {
      this.prefsTabWin.gBrowser.selectedTab = this.prefsTab;
      this.prefsTabWin.focus();
    }

    var event = new this.prefsTab.linkedBrowser
      .contentWindow.CustomEvent("ssleuth-prefwindow-index", {
        "detail": index
      });
    this.prefsTab.linkedBrowser.contentWindow.dispatchEvent(event);
    // This event won't be received for the first time - can't sync 
    // with 'load' ?
    // Doing a load event listener and sending the event will bring 
    // other problems
    //   - Will not receive the 'load' if the tab is already in focus.
    //   - Won't get the first event again, if we remove the event listener 
    //     from inside.
    // So send the tab index in a storage for the first time.
    let application =
      Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);
    application.storage.set("ssleuth.prefwindow.tabindex", index);
  },

  closeTab: function () {
    const prefsTab = this.prefsTab;
    if (prefsTab) {
      this.prefsTabWin.gBrowser.removeTab(prefsTab);
      this.prefsTab = null;
      this.prefsTabWin = null;
    }
  },

  readInitPreferences: function () {
    const prefs = SSleuthPreferences.prefService;
    var sp = ssleuthDefaultPrefs;
    for (let [key, val] in Iterator(sp.PREFS)) {
      switch (typeof val) {
      case "boolean":
        sp.PREFS[key] = prefs.getBoolPref(sp.PREF_BRANCH + key);
        break;
      case "number":
        sp.PREFS[key] = prefs.getIntPref(sp.PREF_BRANCH + key);
        break;
      case "string":
        sp.PREFS[key] = prefs.getCharPref(sp.PREF_BRANCH + key);
        break;
      case "object":
        sp.PREFS[key] = JSON.parse(prefs.getCharPref(sp.PREF_BRANCH + key));
      }
    }
    return sp;
  }
};

function ssleuthPrefListener(branch_name, callback) {
  var prefService = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService);
  this._branch = prefService.getBranch(branch_name);
  this._branch.QueryInterface(Ci.nsIPrefBranch2);
  this._callback = callback;
}

ssleuthPrefListener.prototype.observe = function (subject, topic, data) {
  if (topic == 'nsPref:changed')
    this._callback(this._branch, data);
};

ssleuthPrefListener.prototype.register = function (trigger) {
  this._branch.addObserver('', this, false);
  if (trigger) {
    let that = this;
    this._branch.getChildList('', {}).
    forEach(function (pref_leaf_name) {
      that._callback(that._branch, pref_leaf_name);
    });
  }
};

ssleuthPrefListener.prototype.unregister = function () {
  if (this._branch)
    this._branch.removeObserver('', this);
};
