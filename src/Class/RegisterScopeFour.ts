import { Afip } from '../Afip';
import { WebServiceOptions } from '../Utils/Interfaces';
import { AfipWebService } from './AfipWebService';

/**
 * SDK for AFIP Register Scope Four (ws_sr_padron_a4)
 * 
 * @link http://www.afip.gob.ar/ws/ws_sr_padron_a4/manual_ws_sr_padron_a4_v1.1.pdf WS Specification
 **/
export class RegisterScopeFour extends AfipWebService {
	constructor(afip: Afip){
		const options: WebServiceOptions = {
			soapV12: false,
			WSDL: 'ws_sr_padron_a4-production.wsdl',
			URL: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4',
			WSDL_TEST: 'ws_sr_padron_a4.wsdl',
			URL_TEST: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4',
			afip
		}

		super(options);
	}
	/**
	 * Asks to web service for servers status {@see WS 
	 * Specification item 3.1}
	 *
	 * @return object { appserver : Web Service status, 
	 * dbserver : Database status, authserver : Autentication 
	 * server status}
	 **/
	async getServerStatus() {
		return this.executeRequest('dummy');
	}

	/**
	 * Asks to web service for taxpayer details {@see WS 
	 * Specification item 3.2}
	 *
	 * @throws Exception if exists an error in response 
	 *
	 * @return object|null if taxpayer does not exists, return null,  
	 * if it exists, returns full response {@see 
	 * WS Specification item 3.2.2}
	 **/
	async getTaxpayerDetails(identifier) {
		// Get token and sign
		let { token, sign } = await this.afip.GetServiceTA('ws_sr_padron_a4');

		// Prepare SOAP params
		let params = {
			token, sign,
			cuitRepresentada: this.afip.CUIT,
			idPersona: identifier
		};
		
		return this.executeRequest('getPersona', params)
		.then(res => res.persona)
		.catch(err => { if (err.message.indexOf('No existe') !== -1) { return null } else { throw err }});
	}

	/**
	 * Send request to AFIP servers
	 * 
	 * @param operation SOAP operation to execute 
	 * @param params Parameters to send
	 *
	 * @return mixed Operation results 
	 **/
	async executeRequest(operation, params = {})
	{
		let results = await super.executeRequest(operation, params);

		return results[operation === 'getPersona' ? 'personaReturn' : 'return'];
	}
}

