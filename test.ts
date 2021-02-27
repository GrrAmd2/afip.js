import { Afip } from "./src/Afip";

const asd = new Afip({ CUIT: 899999 })

console.log(asd.RegisterScopeFive.getServerStatus());
