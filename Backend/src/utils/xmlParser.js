import { DOMParser } from "xmldom";

export function parseXML(responseText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(`<root>${responseText}</root>`, "text/xml");

    const resValue = xmlDoc.getElementsByTagName("Response")[0]?.textContent || null;
    const data = xmlDoc.getElementsByTagName("data")[0]?.textContent || null;

    return { resValue, data };
}