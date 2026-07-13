// ==UserScript==
// @name         Neopets Wealth Tracker
// @namespace    https://github.com/FreshPearspective/NWT
// @version      0.1.0
// @description  Tracks your total Neopets wealth over time to monitor growth, decline, and spending habits.
// @author       FreshPerspective
// @match        https://www.neopets.com/*
// @icon         https://www.neopets.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {

"use strict";

/******************************************************************************
 *
 * Neopets Wealth Tracker
 *
 * Repository
 * ----------
 * https://github.com/FreshPearspective/NWT
 *
 * Project Goal
 * ------------
 * Track total Neopets wealth over time.
 *
 * Current Release
 * ---------------
 * 0.1.0
 *
 * Development Status
 * ------------------
 * Alpha
 *
 ******************************************************************************/

const BUILD = Object.freeze({

    VERSION: "0.1.0",

    RELEASE: "Alpha",

    BUILD_DATE: "2026-07-13",

    PROJECT: "Neopets Wealth Tracker",

    AUTHOR: "FreshPerspective"

});

/******************************************************************************
 *
 * CONFIGURATION
 *
 ******************************************************************************/

const CONFIG = Object.freeze({

    DEBUG: true,

    STORAGE_KEY: "NWT_STORAGE",

    SETTINGS_KEY: "NWT_SETTINGS",

    HISTORY_LIMIT: 365,

    SAVE_INTERVAL: 30000,

    UI_UPDATE_INTERVAL: 1000

});

/******************************************************************************
 *
 * CONSTANTS
 *
 ******************************************************************************/

const CONSTANTS = Object.freeze({

    APP_NAME: "Neopets Wealth Tracker",

    STORAGE_VERSION: 1,

    DEFAULT_CURRENCY: "NP"

});

/******************************************************************************
 *
 * ROOT NAMESPACE
 *
 ******************************************************************************/

const NWT = {

    Build: BUILD,

    Config: CONFIG,

    Constants: CONSTANTS,

    Managers: {},

    Services: {},

    Modules: {},

    Utilities: {},

    Diagnostics: {},

    UI: {},

    API: {}

};

/******************************************************************************
 *
 * UTILITY FUNCTIONS
 *
 ******************************************************************************/

NWT.Utilities.isObject = function (value) {

    return value !== null &&
           typeof value === "object" &&
           !Array.isArray(value);

};

NWT.Utilities.deepClone = function (value) {

    return structuredClone(value);

};

NWT.Utilities.timestamp = function () {

    return Date.now();

};

NWT.Utilities.formatNumber = function (value) {

    return Number(value).toLocaleString("en-US");

};

NWT.Utilities.sleep = function (milliseconds) {

    return new Promise(resolve => {

        setTimeout(resolve, milliseconds);

    });

};

NWT.Utilities.safeExecute = function (callback, fallback = null) {

    try {

        return callback();

    }

    catch (error) {

        console.error("[NWT]", error);

        return fallback;

    }

};
/******************************************************************************
 *
 * LOGGER MANAGER
 *
 * Purpose
 * -------
 * Centralized logging system used throughout the application.
 *
 ******************************************************************************/

NWT.Managers.Logger = (() => {

    const PREFIX = "[NWT]";

    let debugEnabled = CONFIG.DEBUG;

    function buildTimestamp() {

        return new Date().toLocaleTimeString();

    }

    function output(method, args) {

        console[method](
            PREFIX,
            `[${buildTimestamp()}]`,
            ...args
        );

    }

    return {

        enable() {

            debugEnabled = true;

        },

        disable() {

            debugEnabled = false;

        },

        debug(...args) {

            if (!debugEnabled) return;

            output("log", args);

        },

        info(...args) {

            output("info", args);

        },

        warn(...args) {

            output("warn", args);

        },

        error(...args) {

            output("error", args);

        },

        group(title) {

            if (!debugEnabled) return;

            console.group(`${PREFIX} ${title}`);

        },

        groupEnd() {

            if (!debugEnabled) return;

            console.groupEnd();

        },

        time(label) {

            if (!debugEnabled) return;

            console.time(`${PREFIX} ${label}`);

        },

        timeEnd(label) {

            if (!debugEnabled) return;

            console.timeEnd(`${PREFIX} ${label}`);

        }

    };

})();

/******************************************************************************
 *
 * STORAGE MANAGER
 *
 * Purpose
 * -------
 * Wrapper around Tampermonkey persistent storage.
 *
 ******************************************************************************/

NWT.Managers.Storage = (() => {

    const Logger = NWT.Managers.Logger;

    function exists(key) {

        return GM_listValues().includes(key);

    }

    function get(key, defaultValue = null) {

        try {

            return GM_getValue(key, defaultValue);

        }

        catch (error) {

            Logger.error("Storage read failed:", key, error);

            return defaultValue;

        }

    }

    function set(key, value) {

        try {

            GM_setValue(key, value);

            return true;

        }

        catch (error) {

            Logger.error("Storage write failed:", key, error);

            return false;

        }

    }

    function remove(key) {

        try {

            GM_deleteValue(key);

            return true;

        }

        catch (error) {

            Logger.error("Storage delete failed:", key, error);

            return false;

        }

    }

    function keys() {

        return GM_listValues();

    }

    return {

        exists,

        get,

        set,

        remove,

        keys

    };

})();

/******************************************************************************
 *
 * SETTINGS MANAGER
 *
 * Purpose
 * -------
 * Stores user configurable settings.
 *
 ******************************************************************************/

NWT.Managers.Settings = (() => {

    const Storage = NWT.Managers.Storage;

    const DEFAULT_SETTINGS = {

        debug: CONFIG.DEBUG,

        dashboardEnabled: true,

        autoSnapshots: true,

        snapshotIntervalMinutes: 60,

        notifications: false

    };

    let settings = null;

    function load() {

        settings = Storage.get(

            CONFIG.SETTINGS_KEY,

            structuredClone(DEFAULT_SETTINGS)

        );

        return settings;

    }

    function save() {

        Storage.set(

            CONFIG.SETTINGS_KEY,

            settings

        );

    }

    function get(name) {

        return settings[name];

    }

    function set(name, value) {

        settings[name] = value;

        save();

    }

    function reset() {

        settings = structuredClone(DEFAULT_SETTINGS);

        save();

    }

    return {

        load,

        save,

        get,

        set,

        reset,

        defaults: DEFAULT_SETTINGS

    };

})();

/******************************************************************************
 *
 * STATE MANAGER
 *
 * Purpose
 * -------
 * Holds runtime-only state.
 *
 ******************************************************************************/

NWT.Managers.State = (() => {

    const state = {

        initialized: false,

        currentUser: null,

        currentPage: null,

        lastSnapshot: null,

        startupTime: performance.now(),

        modulesLoaded: [],

        wealth: {

            np: 0,

            bank: 0,

            inventory: 0,

            sdb: 0,

            tradingPost: 0,

            total: 0

        }

    };

    return {

        get() {

            return state;

        },

        set(key, value) {

            state[key] = value;

        },

        update(path, value) {

            if (!(path in state)) {

                return false;

            }

            state[path] = value;

            return true;

        }

    };

})();

NWT.Logger = NWT.Managers.Logger;
NWT.Storage = NWT.Managers.Storage;
NWT.Settings = NWT.Managers.Settings;
NWT.State = NWT.Managers.State;
/******************************************************************************
 *
 * EVENT MANAGER
 *
 * Purpose
 * -------
 * Lightweight publish / subscribe system used by every module.
 *
 ******************************************************************************/

NWT.Managers.Events = (() => {

    const Logger = NWT.Managers.Logger;

    const listeners = new Map();

    function on(eventName, callback) {

        if (typeof callback !== "function") {
            throw new Error(`Event callback for "${eventName}" must be a function.`);
        }

        if (!listeners.has(eventName)) {
            listeners.set(eventName, []);
        }

        listeners.get(eventName).push(callback);

        return callback;

    }

    function once(eventName, callback) {

        function wrapper(payload) {

            off(eventName, wrapper);

            callback(payload);

        }

        on(eventName, wrapper);

    }

    function off(eventName, callback) {

        if (!listeners.has(eventName)) {
            return;
        }

        const list = listeners.get(eventName);

        const index = list.indexOf(callback);

        if (index >= 0) {
            list.splice(index, 1);
        }

    }

    function emit(eventName, payload = null) {

        if (!listeners.has(eventName)) {
            return;
        }

        const list = [...listeners.get(eventName)];

        for (const callback of list) {

            try {

                callback(payload);

            }

            catch (error) {

                Logger.error(
                    `Unhandled exception in event "${eventName}"`,
                    error
                );

            }

        }

    }

    function clear() {

        listeners.clear();

    }

    function listenerCount(eventName) {

        if (!listeners.has(eventName)) {
            return 0;
        }

        return listeners.get(eventName).length;

    }

    function events() {

        return [...listeners.keys()];

    }

    return {

        on,
        once,
        off,
        emit,
        clear,
        listenerCount,
        events

    };

})();

NWT.Events = NWT.Managers.Events;

/******************************************************************************
 *
 * DIAGNOSTICS MANAGER
 *
 ******************************************************************************/

NWT.Managers.Diagnostics = (() => {

    const State = NWT.State;

    const Storage = NWT.Storage;

    function runtimeSeconds() {

        return Math.floor(

            (performance.now() - State.get().startupTime) / 1000

        );

    }

    function storageKeys() {

        return Storage.keys();

    }

    function report() {

        return {

            build: BUILD,

            runtimeSeconds: runtimeSeconds(),

            initialized: State.get().initialized,

            page: State.get().currentPage,

            user: State.get().currentUser,

            storageKeys: storageKeys(),

            wealth: structuredClone(State.get().wealth)

        };

    }

    function print() {

        console.group("[NWT] Diagnostics");

        console.table(report());

        console.groupEnd();

    }

    return {

        report,

        print,

        runtimeSeconds

    };

})();

NWT.Diagnostics = NWT.Managers.Diagnostics;

/******************************************************************************
 *
 * PAGE DETECTION
 *
 ******************************************************************************/

NWT.Modules.Page = (() => {

    function current() {

        const path = window.location.pathname;

        if (path.includes("bank")) {

            return "BANK";

        }

        if (path.includes("inventory")) {

            return "INVENTORY";

        }

        if (path.includes("safetydeposit")) {

            return "SDB";

        }

        if (path.includes("tradingpost")) {

            return "TRADING_POST";

        }

        if (path.includes("auctions")) {

            return "AUCTIONS";

        }

        if (path.includes("market")) {

            return "SHOP";

        }

        return "UNKNOWN";

    }

    return {

        current

    };

})();

/******************************************************************************
 *
 * USER DETECTION
 *
 ******************************************************************************/

NWT.Modules.User = (() => {

    function currentUsername() {

        const links = document.querySelectorAll("a");

        for (const link of links) {

            const href = link.getAttribute("href") || "";

            if (href.includes("userlookup.phtml?user=")) {

                const url = new URL(href, location.origin);

                return url.searchParams.get("user");

            }

        }

        return null;

    }

    return {

        currentUsername

    };

})();
  /******************************************************************************
 *
 * STARTUP MANAGER
 *
 * Purpose
 * -------
 * Responsible for initializing every core system in the correct order.
 *
 ******************************************************************************/

NWT.Managers.Startup = (() => {

    const Logger = NWT.Logger;
    const Settings = NWT.Settings;
    const State = NWT.State;
    const Events = NWT.Events;

    let initialized = false;

    function initializeManagers() {

        Logger.group("Initializing Managers");

        Settings.load();

        Logger.debug("Settings loaded.");

        Logger.groupEnd();

    }

    function detectEnvironment() {

        const state = State.get();

        state.currentPage = NWT.Modules.Page.current();

        state.currentUser = NWT.Modules.User.currentUsername();

        Logger.debug("Environment detected.", {
            page: state.currentPage,
            user: state.currentUser
        });

    }

    function registerCoreEvents() {

        Events.on("wealth:updated", payload => {

            Logger.debug("Wealth updated.", payload);

        });

        Events.on("snapshot:created", payload => {

            Logger.debug("Snapshot created.", payload);

        });

    }

    function initializeState() {

        const state = State.get();

        state.initialized = true;

        state.modulesLoaded.push(
            "Logger",
            "Storage",
            "Settings",
            "State",
            "Events",
            "Diagnostics",
            "Page",
            "User"
        );

    }

    function boot() {

        if (initialized) {

            Logger.warn("Startup already completed.");

            return;

        }

        Logger.group(`${BUILD.PROJECT} ${BUILD.VERSION}`);

        Logger.info("Beginning startup sequence...");

        initializeManagers();

        detectEnvironment();

        registerCoreEvents();

        initializeState();

        initialized = true;

        Logger.info("Startup complete.");

        Logger.groupEnd();

        Events.emit("nwt:ready", {

            version: BUILD.VERSION,

            release: BUILD.RELEASE

        });

    }

    return {

        boot,

        get initialized() {

            return initialized;

        }

    };

})();

NWT.Startup = NWT.Managers.Startup;

/******************************************************************************
 *
 * DEVELOPER API
 *
 * Purpose
 * -------
 * Public API exposed to the browser console.
 *
 ******************************************************************************/

NWT.API.version = () => BUILD.VERSION;

NWT.API.build = () => structuredClone(BUILD);

NWT.API.state = () => structuredClone(NWT.State.get());

NWT.API.settings = () => structuredClone(

    NWT.Settings.load()

);

NWT.API.report = () =>

    NWT.Diagnostics.report();

NWT.API.storageKeys = () =>

    NWT.Storage.keys();

NWT.API.emit = (eventName, payload) =>

    NWT.Events.emit(eventName, payload);

/******************************************************************************
 *
 * GLOBAL EXPORT
 *
 ******************************************************************************/

Object.defineProperty(window, "NWT", {

    value: Object.freeze(NWT),

    configurable: false,

    writable: false,

    enumerable: true

});

/******************************************************************************
 *
 * APPLICATION ENTRY POINT
 *
 ******************************************************************************/

(function startApplication() {

    try {

        NWT.Startup.boot();

    }

    catch (error) {

        console.error(

            "[NWT] Fatal startup error.",

            error

        );

    }

})();

/******************************************************************************
 *
 * RELEASE 0.1 ROADMAP
 *
 * [x] Core Foundation
 * [x] Logger
 * [x] Storage
 * [x] Settings
 * [x] Runtime State
 * [x] Event System
 * [x] Diagnostics
 * [x] Startup Manager
 * [x] Developer API
 *
 * Release 0.2
 * -------------
 * [ ] Wealth Snapshot Manager
 * [ ] Bank Scanner
 * [ ] Inventory Scanner
 * [ ] Safety Deposit Box Scanner
 * [ ] Net Worth Calculator
 *
 ******************************************************************************/

})();
/******************************************************************************
 *
 * WEALTH SNAPSHOT MANAGER
 *
 * Purpose
 * -------
 * Creates immutable wealth snapshots used for historical tracking.
 *
 ******************************************************************************/

NWT.Managers.Wealth = (() => {

    const Logger = NWT.Logger;
    const Events = NWT.Events;
    const State = NWT.State;

    function emptySnapshot() {

        return {

            timestamp: Date.now(),

            np: 0,

            bank: 0,

            inventory: 0,

            sdb: 0,

            tradingPost: 0,

            gallery: 0,

            total: 0

        };

    }

    function calculateTotal(snapshot) {

        return (

            snapshot.np +
            snapshot.bank +
            snapshot.inventory +
            snapshot.sdb +
            snapshot.tradingPost +
            snapshot.gallery

        );

    }

    function create(values = {}) {

        const snapshot = Object.assign(

            emptySnapshot(),

            values

        );

        snapshot.total = calculateTotal(snapshot);

        State.get().wealth = structuredClone(snapshot);

        Events.emit("wealth:updated", snapshot);

        Logger.info("Wealth snapshot created.", snapshot);

        return structuredClone(snapshot);

    }

    function current() {

        return structuredClone(

            State.get().wealth

        );

    }

    return {

        create,

        current,

        calculateTotal

    };

})();

NWT.Wealth = NWT.Managers.Wealth;
