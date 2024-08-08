import Log from "./logger.js";
const requestMap = new Map();

export function recordEvent(key, extras = {}){
    if (!key) return "error";

    const now = new Date();
    const now_ms = now.valueOf();
    const record = requestMap.get(key);
    
    if(!record) {
        requestMap.set(key, {count: 1, ...extras, latest: now, latest_ms: now_ms});
        return 1;
    } else {
        record.count = record.count + 1;
        record.latest = now;
        record.latest_ms = now_ms;
        return record.count;
    }
}

export function retrieveEvents(key){
    return requestMap.get(key) || [...requestMap.entries()];
}

