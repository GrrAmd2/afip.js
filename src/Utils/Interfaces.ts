import { Afip } from '../Afip';

export interface WebServiceOptions {
  soapV12: boolean;
  WSDL: string;
  URL: string;
  WSDL_TEST: string;
  URL_TEST: string;
  afip: Afip;
}
