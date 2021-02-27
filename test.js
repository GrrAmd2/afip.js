"use strict";
exports.__esModule = true;
var Afip_1 = require("./src/Afip");
var asd = new Afip_1.Afip({ CUIT: 899999 });
console.log(asd.RegisterScopeFive.getServerStatus());
