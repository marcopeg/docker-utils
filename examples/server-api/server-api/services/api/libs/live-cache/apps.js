
const extend = require('extend');
const yaml = require('node-yaml');
const Cmd = require('../cmd');

const settings = require('../settings');
const services = require('./services');

const UPDATE_DELAY = 30 * 1000;

let _clocks = {};
let isRunning = false;
let cache = {};

exports.start = () => {
    isRunning = true;
    Object.keys(cache).forEach(appId => setTimeout(() => loop(appId)));
};

exports.stop = () => {
    isRunning = false;
    Object.keys(_clocks).forEach(appId => clearTimeout(_clocks[appId]));
};

exports.refresh = () => {
    exports.stop();
    exports.start();
};

exports.snapshot = () => {
    let snap = extend(true, cache);
    Object.keys(snap).forEach(appId => {
        snap[appId].services = services.snapshot(appId);
        snap[appId].isReady = appIsReady(snap[appId]);
        snap[appId].isRunning = appIsRunning(snap[appId]);
    });
    return snap;
};

const appIsReady = data => {
    let { services } = data;
    let servicesList = Object.keys(services);
    return servicesList.every(serviceId => {
        let service = services[serviceId];
        return service.isReady;
    });
};

const appIsRunning = data => {
    let { services } = data;
    let servicesList = Object.keys(services);
    return servicesList.every(serviceId => {
        let service = services[serviceId];
        return service.isRunning;
    });
};

exports.registerApp = data => {
    let { id: appId } = data;
    let app = cache[appId];
    if (!app) {
        app = {};
        setTimeout(() => loop(appId));
    }
    cache[appId] = extend(app, data);
};

const loop = appId => {
    getAppConfiguration(appId)
        .then(updateCache)
        .then(() => nextTick(appId))
        .catch(err => {
            console.error(err);
            nextTick(appId);
        });
};

const nextTick = appId => {
    clearTimeout(_clocks[appId]);
    if (!isRunning) {
        return;
    }
    _clocks[appId] = setTimeout(() => loop(appId), UPDATE_DELAY);
}

const getAppConfiguration = appId => new Promise((resolve, reject) => {
    let cmd = new Cmd('./humble-server ' + appId + ' config');
    cmd.exec()
        .then(data => {
            try {
                resolve(extend({ id: appId }, yaml.parse(data)));
            } catch (e) {
                reject(e);
            }
        })
        .catch(reject);
});

const updateCache = data => {
    let { id: appId } = data;
    let servicesList = Object.keys(data.services)
    servicesList.forEach(serviceId => services.registerService(appId, serviceId, data.services[serviceId]));
    cache[appId] = extend(true, cache[appId], { services: servicesList });
}