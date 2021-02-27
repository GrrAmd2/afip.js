import { ElectronicBilling } from "./Class/ElectronicBilling";
import { RegisterScopeFive } from "./Class/RegisterScopeFive";
import { RegisterScopeFour } from "./Class/RegisterScopeFour";
import { RegisterScopeTen } from "./Class/RegisterScopeTen";
import { RegisterScopeThirteen } from "./Class/RegisterScopeThirteen";
import * as fs from "fs";
import * as path from "path";
import * as soap from "soap";
import * as forge from "node-forge";
import * as xml2js from "xml2js";

interface Options {
  production?: boolean;
  cert?: string;
  key?: string;
  res_folder?: string;
  ta_folder?: string;
  CUIT: number;
}

const xmlParser = new xml2js.Parser({
  normalizeTags: true,
  normalize: true,
  explicitArray: false,
  attrkey: 'header',
  tagNameProcessors: [key => key.replace('soapenv:', '')]
});

export class Afip {
  private WSAA_WSDL: string;
  private WSAA_URL: string;
  private CERT: string;
  private PRIVATEKEY: string;
  private RES_FOLDER: string;
  private TA_FOLDER: string;
  public CUIT: number;
  public options: Options;

  public ElectronicBilling: ElectronicBilling;
  public RegisterScopeFour: RegisterScopeFour;
  public RegisterScopeFive: RegisterScopeFive;
  public RegisterInscriptionProof: RegisterScopeFive;
  public RegisterScopeTen: RegisterScopeTen;
  public RegisterScopeThirteen: RegisterScopeThirteen;

  constructor(options: Options) {
    this.options.production = options.production || false;
    this.options.cert = options.cert || null;
    this.options.key = options.key || null;
    this.options.res_folder = options.res_folder || null;
    this.options.ta_folder = options.ta_folder || null;

    this.options = options;

    this.CUIT = options.CUIT;
    this.RES_FOLDER = options.res_folder;
    this.TA_FOLDER = options.ta_folder;
    this.CERT = path.resolve(this.RES_FOLDER, options['cert']);
    this.PRIVATEKEY = path.resolve(this.RES_FOLDER, options.key);
    this.WSAA_WSDL = path.resolve(__dirname, 'Afip_res/', 'wsaa.wsdl');

    if (options.production) {
      this.WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
    } else {
      this.WSAA_URL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
    }

    this.ElectronicBilling = new ElectronicBilling(this);
    this.RegisterScopeFour = new RegisterScopeFour(this);
    this.RegisterScopeFive = new RegisterScopeFive(this);
    this.RegisterInscriptionProof = new RegisterScopeFive(this);
    this.RegisterScopeTen = new RegisterScopeTen(this);
    this.RegisterScopeThirteen = new RegisterScopeThirteen(this);
  }

  /**
   * Gets token authorization for an AFIP Web Service
   *
   * @param service Service for token authorization
   **/
  async GetServiceTA(service: string, firstTry = true) {
    // Declare token authorization file path
    const taFilePath = path.resolve(
      this.TA_FOLDER,
      `TA-${this.options["CUIT"]}-${service}${this.options["production"] ? "-production" : ""
      }.json`
    );

    // Check if token authorization file exists
    const taFileAccessError = await new Promise((resolve) => {
      fs.access(taFilePath, fs.constants.F_OK, resolve);
    });

    // If have access to token authorization file
    if (!taFileAccessError) {
      const taData = require(taFilePath);
      const actualTime = new Date(Date.now() + 600000);
      const expirationTime = new Date(taData.header[1].expirationtime);

      // Delete TA cache
      delete require.cache[require.resolve(taFilePath)];

      if (actualTime < expirationTime) {
        // Return token authorization
        return {
          token: taData.credentials.token,
          sign: taData.credentials.sign,
        };
      }
    }

    // Throw error if this is not the first try to get token authorization
    if (firstTry === false) {
      throw new Error("Error getting Token Autorization");
    }

    // Create token authorization file
    await this.CreateServiceTA(service).catch((err) => {
      throw new Error(`Error getting Token Autorization ${err}`);
    });

    // Try to get token authorization one more time
    return await this.GetServiceTA(service, false);
  }

  /**
   * Create an TA from WSAA
   *
   * Request to WSAA for a tokent authorization for service
   * and save this in a json file
   *
   * @param service Service for token authorization
   **/
  async CreateServiceTA(service) {
    const date = new Date();

    // Tokent request authorization XML
    const tra = `<?xml version="1.0" encoding="UTF-8" ?>
	  <loginTicketRequest version="1.0">
	  	<header>
	  		<uniqueId>${Math.floor(date.getTime() / 1000)}</uniqueId>
	  		<generationTime>${new Date(
      date.getTime() - 600000
    ).toISOString()}</generationTime>
	  		<expirationTime>${new Date(
      date.getTime() + 600000
    ).toISOString()}</expirationTime>
	  	</header>
	  	<service>${service}</service>
	  </loginTicketRequest>`.trim();

    // Get cert file content
    const certPromise = new Promise((resolve, reject) => {
      fs.readFile(this.CERT, { encoding: "utf8" }, (err, data) =>
        err ? reject(err) : resolve(data)
      );
    }) as Promise<string>;

    // Get key file content
    const keyPromise = new Promise((resolve, reject) => {
      fs.readFile(this.PRIVATEKEY, { encoding: "utf8" }, (err, data) =>
        err ? reject(err) : resolve(data)
      );
    }) as Promise<string>;

    // Wait for cert and key content
    const [cert, key] = await Promise.all([certPromise, keyPromise]);

    // Sign Tokent request authorization XML
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, "utf8");
    p7.addCertificate(cert);
    p7.addSigner({
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date().toISOString()
        },
      ],
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      key: key,
    });
    p7.sign();
    const bytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const signedTRA = Buffer.from(bytes, "binary").toString("base64");

    // SOAP Client options
    const soapClientOptions = { disableCache: true, endpoint: this.WSAA_URL };

    // Create SOAP client
    const soapClient = await soap.createClientAsync(
      this.WSAA_WSDL,
      soapClientOptions
    );

    // Arguments for soap client request
    const loginArguments = { in0: signedTRA };

    // Call loginCms SOAP method
    const [loginCmsResult] = await soapClient.loginCmsAsync(loginArguments);

    // Parse loginCmsReturn to JSON
    const res = await xmlParser.parseStringPromise(
      loginCmsResult.loginCmsReturn
    );

    // Declare token authorization file path
    const taFilePath = path.resolve(
      this.TA_FOLDER,
      `TA-${this.options["CUIT"]}-${service}${this.options["production"] ? "-production" : ""
      }.json`
    );

    // Save Token authorization data to json file
    await new Promise<void>((resolve, reject) => {
      fs.writeFile(
        taFilePath,
        JSON.stringify(res.loginticketresponse),
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }
}
