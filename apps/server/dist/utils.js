"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalIP = getLocalIP;
const os_1 = __importDefault(require("os"));
function getLocalIP() {
    for (const ifaceList of Object.values(os_1.default.networkInterfaces())) {
        if (!ifaceList)
            continue;
        for (const iface of ifaceList) {
            if (!iface.internal && iface.family === 'IPv4')
                return iface.address;
        }
    }
    return 'localhost';
}
