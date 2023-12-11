const parseDate = require("./strftime");
const titleCase = require("./titleCase");

const amazonAsinSkuMappingJson = require("../../amazon-asin-sku-mapping.json");
const flipkartFsnSkuMappingJson = require("../../flipkart-fsn-sku-mapping.json");
const myntraFsnSkuMappingJson = require("../../myntra-asin-sku-mapping.json");
const ajioAsinSkuMappingJson = require("../../ajio-asin-sku-mapping.json");

const stateMappingJson = require("../../state-mapping.json");

const DATE_REGEX =
  /(\d{1,4})[\s\p{Dash}.\/](\d{1,2}|\w+)[\s\p{Dash}.\/](\d{2,4})/gmu;

function addDays(date, days) {
  var result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days
  );

  return result;
}

function getEndDate(date) {
  const DATE_FORMAT = "%b %d, %Y";
  const warrantyEndDate = addDays(date, 365);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log({ date, warrantyEndDate });

  if (warrantyEndDate.getTime() > today.getTime()) {
    let extendedWarrantEndDate = addDays(warrantyEndDate, 178);

    return {
      startDate: parseDate(DATE_FORMAT, date),
      endDate: parseDate(DATE_FORMAT, extendedWarrantEndDate),
    };
  } else {
    return {
      startDate: parseDate(DATE_FORMAT, date),
      endDate: "Not Applicable",
    };
  }
}

function decodeAndExtractText(text, regex = null) {
  text = decodeURIComponent(text);
  if (regex == null) {
    return text;
  }

  let match = text.match(regex);

  if (match == null) {
    return "";
  }

  text = match[0];

  return text;
}

function parseNasherMilesInvoice(Texts) {
  let orderId = Texts[2].R[0].T;
  orderId = decodeAndExtractText(orderId, /[\d]+\p{Dash}[\d]+/gmu);

  let invoiceDate = Texts[3].R[0].T;
  invoiceDate = decodeAndExtractText(invoiceDate, DATE_REGEX);

  const invoiceDateAr = invoiceDate.split(/\p{Dash}/gu);
  let { startDate, endDate } = getEndDate(
    new Date(invoiceDateAr[0], invoiceDateAr[1] - 1, invoiceDateAr[2])
  );

  // Finding index of total text & then getting total invoice value by the next array element in Texts
  const TOTAL_TEXT_INDEX = Texts.findIndex(({ R }) => R[0].T == "Total");
  let totalInvoiceAmount = decodeAndExtractText(
    Texts[TOTAL_TEXT_INDEX + 1].R[0].T
  );
  totalInvoiceAmount = totalInvoiceAmount.replaceAll(/[^\d]/g, "");

  const BILL_TO_TEXT_INDEX = Texts.findIndex(({ R }) =>
    R[0].T.startsWith("Bill")
  );
  let billToName = decodeAndExtractText(Texts[BILL_TO_TEXT_INDEX + 1].R[0].T);

  const INVOICE_TEXT_INDEX = Texts.findIndex(({ R }) =>
    R[0].T.startsWith("Invoice")
  );
  let billToAddressArray = Texts.slice(
    BILL_TO_TEXT_INDEX + 2,
    INVOICE_TEXT_INDEX
  );

  let billToState = "",
    billToZipCode = "";
  for (let i = 0; i < billToAddressArray.length; i++) {
    billToAddressArray[i] = decodeAndExtractText(billToAddressArray[i].R[0].T);

    let stateZip = decodeAndExtractText(
      billToAddressArray[i],
      /[\w\s]+\p{Dash}\s+\d{6}/gmu
    );
    if (stateZip.length > 0) {
      billToState = stateZip.match(/[\w\s]+/gmu)[0]?.trim();
      billToZipCode = stateZip.match(/\d{6}/gmu)[0];
    }
  }

  let billToAddress = billToAddressArray.join(" ");

  let sku = "";
  let dataPostInvoiceText = Texts.slice(INVOICE_TEXT_INDEX + 1);

  for (let i = 0; i < dataPostInvoiceText.length; i++) {
    let { x, R } = dataPostInvoiceText[i];

    if (x < 10 && R[0].T.startsWith("SKU") == false) {
      sku += decodeAndExtractText(R[0].T);
    } else if (decodeAndExtractText(R[0].T).includes("%")) {
      sku += ", ";
    }
  }

  // Remove extra , & space
  sku = sku.replace(/,\s+$/, "");

  let result = [];

  console.log(sku);
  if (sku.includes(",")) {
    for (let singleSKU of sku.split(",")) {
      result.push({
        orderId,
        startDate,
        endDate,
        totalInvoiceAmount,
        billToName,
        billToState,
        billToZipCode,
        billToAddress,
        sku: singleSKU,
        asin: "NA",
      });
    }
  } else {
    result.push({
      orderId,
      startDate,
      endDate,
      totalInvoiceAmount,
      billToName,
      billToState,
      billToZipCode,
      billToAddress,
      sku,
      asin: "NA",
    });
  }

  return result;
}

function parseAmazonInvoice(Texts) {
  const ORDER_NUMBER_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().includes("order number")
  );

  let orderId = decodeAndExtractText(
    Texts[ORDER_NUMBER_TEXT_INDEX + 1].R[0].T,
    /\d+\p{Dash}\d+\p{Dash}\d+/gmu
  );

  const INVOICE_DATE_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().includes("invoice date")
  );

  let invoiceDate = decodeAndExtractText(
    Texts[INVOICE_DATE_TEXT_INDEX + 1].R[0].T,
    DATE_REGEX
  );

  const SHIPPING_ADDRESS_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().includes("shipping address")
  );

  let billToName = decodeAndExtractText(
    Texts[SHIPPING_ADDRESS_INDEX + 1].R[0].T
  );

  let ut_code_text_count = 0;
  let UT_CODE_TEXT_INDEX = -1;
  for (let i = 0; i < Texts.length; i++) {
    const { R } = Texts[i];
    if (decodeAndExtractText(R[0].T).toLowerCase().includes("ut code")) {
      ut_code_text_count++;
    }
    if (ut_code_text_count == 2) {
      UT_CODE_TEXT_INDEX = i;
      break;
    }
  }

  console.log({ UT_CODE_TEXT_INDEX });

  let billToAddressArray = Texts.slice(
    SHIPPING_ADDRESS_INDEX + 3,
    UT_CODE_TEXT_INDEX
  );

  console.log(SHIPPING_ADDRESS_INDEX);

  let billToState = "",
    billToZipCode = "";
  for (let i = 0; i < billToAddressArray.length; i++) {
    billToAddressArray[i] = decodeAndExtractText(billToAddressArray[i].R[0].T);

    let stateZip = decodeAndExtractText(
      billToAddressArray[i],
      /[\w\s]+,\s+\d{6}/gmu
    );
    if (stateZip.length > 0) {
      billToState = stateZip.match(/[\w\s]+/gmu)[0]?.trim();
      billToZipCode = stateZip.match(/\d{6}/gmu)[0];
    }
  }

  let billToAddress = billToAddressArray.join(" ");

  let skuAr = [];
  let asinAr = [];

  let productDescription = "";
  let productDescriptionFlag = false;
  for (let i = 0; i < Texts.length; i++) {
    const { R } = Texts[i];

    let text = decodeAndExtractText(R[0].T);

    if (text.startsWith("Nasher")) {
      productDescriptionFlag = true;
    } else if (text.includes("GST")) {
      console.log({ productDescription });
      productDescriptionFlag = false;
      /* Regex to match asin |B0BTDN9BB2*/
      let asin = productDescription.match(/(?<=[\|])([\s\w]+)/g);
      /* Regex to match sku |( LUG_NM_1228_Istanbul_Cream&Brown_S3 )*/
      let sku = productDescription.match(/\(([\w_&\s]+)\)/g);
      if (asin) {
        asinAr.push(asin.at(-1));
      }
      if (sku) {
        // removes brackets () from sku regex match
        skuAr.push(sku.at(-1)?.replaceAll(/[/(/)]/g, ""));
      }
      productDescription = "";
      continue;
    }

    /* Overwriting SKU read logic to read data from amazon asin sku mapping file */
    for (let i = 0; i < asinAr.length; i++) {
      let asin = asinAr[i].trim();

      if (amazonAsinSkuMappingJson.hasOwnProperty(asin)) {
        skuAr[i] = amazonAsinSkuMappingJson[asin];
      } else {
        skuAr[i] = "NA";
      }
    }

    if (productDescriptionFlag) {
      productDescription += text;
    }
  }

  // Remove extra , & space
  let sku = skuAr.join(", ");
  let asin = asinAr.join(", ");

  let dateAr = invoiceDate.split(/[\p{Dash}.\/]/);
  const invoiceDateObj = new Date(
    dateAr.at(-1),
    dateAr.at(-2) - 1,
    dateAr.at(-3)
  );
  invoiceDate = parseDate("%b %d, %Y", invoiceDateObj);
  let { startDate, endDate } = getEndDate(invoiceDateObj);

  const AMOUNT_IN_WORDS_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().includes("amount in words")
  );

  let totalInvoiceAmount = decodeAndExtractText(
    Texts[AMOUNT_IN_WORDS_TEXT_INDEX - 1].R[0].T
  );
  totalInvoiceAmount = totalInvoiceAmount.replaceAll(/[^\d.]+/g, "");

  const result = [];
  for (let i in asinAr) {
    result.push({
      orderId,
      startDate,
      endDate,
      billToName,
      billToState,
      billToZipCode,
      billToAddress,
      sku: skuAr[i],
      asin: asinAr[i],
      totalInvoiceAmount,
    });
  }

  return result;
}

function parseFlipkartInvoice(Texts, text) {
  /* 
    FSN in Flipkart Invoice is considered as ASIN 
    Flipkart Invoices have 2 variations: 1 -> With ASIN, 2 -> Without ASIN
  */
  const isAsinPresent = Texts.some(({ R }) =>
    decodeAndExtractText(R[0].T).startsWith("FSN")
  );

  if (!isAsinPresent) {
    return "Non FSN Flipkart invoices are not supported yet.";
  }

  let orderId = text.match(/(?<=order\s+id:\s+)\w+/gi)?.[0];
  let invoiceDate = text.match(
    /(?<=order\s+date:\s+)(\d{1,4})[\s\p{Dash}.\/](\d{1,2}|\w+)[\s\p{Dash}.\/](\d{2,4})/gimu
  )?.[0];
  /* 
    let invoiceDate = "",
      orderId = "";
    for (let i in Texts) {
    let { R } = Texts[i];
    if (orderId.length == 0) {
      let text = decodeAndExtractText(R[0].T, /(?<=order\s+id:\s+)\w+/gi);

      if (text.length > 0) {
        orderId = text;
      } else {
        text = decodeAndExtractText(R[0].T, /order\s+id/gi);
        if (text?.length > 0) {
          orderId = decodeAndExtractText(Texts[i + 1]?.R[0].T);
        }
      }
    }

    

    if (invoiceDate.length == 0) {
      let text = decodeAndExtractText(Texts[i - 1]?.R[0].T, DATE_REGEX);

      if (text?.length > 0) {
        invoiceDate = text;
      }
    }

    if (invoiceDate.length > 0 && orderId.length > 0) {
      break;
    }
  } */

  let invoiceDateArr = invoiceDate.split(/[\p{Dash}\/]/gu);
  let { startDate, endDate } = getEndDate(
    new Date(invoiceDateArr[2], invoiceDateArr[1] - 1, invoiceDateArr[0])
  );

  const BILL_TO_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().startsWith("bill to")
  );

  const PHONE_TEXT_INDEX =
    BILL_TO_TEXT_INDEX +
    Texts.slice(BILL_TO_TEXT_INDEX).findIndex(({ R }) =>
      decodeAndExtractText(R[0].T).toLowerCase().startsWith("phone")
    );

  let addressAr = Texts.slice(BILL_TO_TEXT_INDEX + 1, PHONE_TEXT_INDEX);
  console.log(addressAr);
  for (let i in addressAr) {
    addressAr[i] = decodeAndExtractText(addressAr[i].R[0].T);
  }

  let billToName = addressAr.shift();

  let billToAddress = addressAr.join("").trim();
  let stateZip = billToAddress.split(".").at(-1);
  let billToZipCode = stateZip.match(/\d{6}/g)[0];

  let stateZipArr = stateZip.split(/\s+/);
  let billToState = stateZipArr
    .slice(stateZipArr.indexOf(billToZipCode) + 1)
    .join(" ");

  let GRAND_TOTAL_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().startsWith("grand total")
  );

  const totalInvoiceAmount = Texts[GRAND_TOTAL_TEXT_INDEX + 2].R[0].T;

  const FIRST_TOTAL_RUPEE_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T)
      .toLowerCase()
      .replace(/[\u20b9\s]+/g, "")
      .endsWith("total")
  );

  const ONLY_TOTAL_TEXT_INDEX =
    1 +
    FIRST_TOTAL_RUPEE_TEXT_INDEX +
    Texts.slice(FIRST_TOTAL_RUPEE_TEXT_INDEX + 1).findIndex(({ R }) =>
      decodeAndExtractText(R[0].T).toLowerCase().startsWith("total")
    );

  let fsnAr = [];
  let skuAr = [];
  const productTexts = Texts.slice(
    FIRST_TOTAL_RUPEE_TEXT_INDEX + 1,
    ONLY_TOTAL_TEXT_INDEX
  );

  for (let i = 0; i < productTexts.length; i++) {
    let { R } = productTexts[i];
    let text = decodeAndExtractText(R[0].T);
    if (text.toLowerCase().startsWith("fsn")) {
      text = text.replaceAll(/fsn:\s+/gi, "");
      if (text.length > 0) {
        fsnAr.push(text);
      } else {
        fsnAr.push(decodeAndExtractText(productTexts[++i].R[0].T));
      }
    }
  }

  for (let fsn of fsnAr) {
    if (flipkartFsnSkuMappingJson.hasOwnProperty(fsn)) {
      skuAr.push(flipkartFsnSkuMappingJson[fsn]);
    } else {
      skuAr.push("NA");
    }
  }

  const asin = fsnAr.join(", ");
  const sku = skuAr.join(", ");

  return {
    orderId,
    startDate,
    endDate,
    billToName,
    billToState,
    billToZipCode,
    billToAddress,
    totalInvoiceAmount,
    asin,
    sku,
  };
}

function parseFlipkartWithoutFsnInvoice(text) {
  const orderId = text.match(/(?<=orderid:)\w{20}/gimu)?.[0];
  const invoiceDate = text.match(
    /(?<=invoicedate:)(\d{1,4})[\s\p{Dash}.\/](\d{1,2}|\w+)[\s\p{Dash}.\/](\d{2,4})/gimu
  )[0];

  const invoiceDateArr = invoiceDate.split(/[\p{Dash}.\/]/gu);
  const { startDate, endDate } = getEndDate(
    new Date(invoiceDateArr[2], invoiceDateArr[1] - 1, invoiceDateArr[0])
  );

  const billToName = text
    .match(/(?<=BillingAddress)\w+/gmu)?.[0]
    .replace(/([A-Z])/g, " $1")
    .trim();

  const billToZipCode = text.match(/\d{6}(?=,in\p{Dash})/gimu)?.[0];

  let billToState = text
    .match(/(?<=\d{6},in\p{Dash})[\w\s]{2,4}/gimu)
    ?.at(-1)
    ?.replaceAll(/\s+/g, "")
    .substring(0, 2);
  if (stateMappingJson.hasOwnProperty(billToState)) {
    billToState = stateMappingJson[billToState];
  }

  const totalInvoiceAmount = text.match(/(?<=totalp[\w\s:]+)\d+.\d+/gimu)?.[0];

  const skuAr = text.match(/(?<=\|)[\w_\s]+(?=\|)/gmu);
  const sku = skuAr?.join(",");

  return {
    orderId,
    startDate,
    endDate,
    billToName,
    billToState,
    billToZipCode,
    totalInvoiceAmount,
    sku,
    asin: "NA",
  };
}

function parseMyntraInvoice(Texts, text) {
  let invoiceDate = "",
    orderId = "";

  for (let i in Texts) {
    let { R } = Texts[i];

    if (orderId.length == 0) {
      let text = decodeAndExtractText(R[0].T, /order\s+number/gi);
      console.log(text);

      if (text.length > 0) {
        orderId = decodeAndExtractText(Texts[i - 1]?.R[0].T, /[\w-]+/g);
      }
    } else if (invoiceDate.length == 0) {
      let text = decodeAndExtractText(R[0].T, /invoice\s+date/gi);
      text = decodeAndExtractText(Texts[i - 1]?.R[0].T, DATE_REGEX);

      if (text?.length > 0) {
        invoiceDate = text;
      }
    }

    if (invoiceDate.length > 0 && orderId.length > 0) {
      break;
    }
  }

  const { startDate, endDate } = getEndDate(new Date(invoiceDate));

  const BILL_TO_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().startsWith("bill to")
  );

  const CUSTOMER_TYPE_TEXT_INDEX =
    BILL_TO_TEXT_INDEX +
    Texts.slice(BILL_TO_TEXT_INDEX).findIndex(({ R }) =>
      decodeAndExtractText(R[0].T).toLowerCase().startsWith("customer type")
    );

  let addressAr = Texts.slice(BILL_TO_TEXT_INDEX + 1, CUSTOMER_TYPE_TEXT_INDEX);
  console.log(addressAr);
  for (let i in addressAr) {
    addressAr[i] = decodeAndExtractText(addressAr[i].R[0].T);
  }

  let billToName = addressAr.shift();
  let billToAddress = addressAr.join("").trim();
  billToAddress = billToAddress.replaceAll(/[^\w\s,\p{Dash}]/gmu, "");

  let billToState = billToAddress.match(/\b\w{2}\b/g)?.at(-1);
  let billToZipCode = billToAddress.match(/\d{6}/g).at(-1);

  /* State shorthand is present in invoice, using mapping file to give full name of the state */
  if (stateMappingJson.hasOwnProperty(billToState)) {
    billToState = stateMappingJson[billToState];
  }

  const FIRST_RS_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().endsWith("rs")
  );
  let totalInvoiceAmount = text.match(/(?<=rs\s)[\d.]+/gim)?.at(-1);

  const CESS_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().startsWith("cess")
  );

  const productListTextsAr = Texts.slice(
    CESS_TEXT_INDEX + 2,
    FIRST_RS_TEXT_INDEX
  );

  let asinAr = [];
  let skuAr = [];
  for (let { R } of productListTextsAr) {
    /*  */
    let asin = decodeAndExtractText(R[0].T, /\w{16}/g);
    if (asin.length > 0) {
      let sku = decodeAndExtractText(R[0].T)
        .match(/(?<=\()[\W\w_]+(?=\))/gm)
        ?.at(-1);
      if (sku?.length > 2) {
        skuAr.push(sku);
      } else {
        skuAr.push("NA");
      }
      asinAr.push(asin);
    }
  }

  for (let i in asinAr) {
    if (skuAr[i] == "NA" && myntraFsnSkuMappingJson.hasOwnProperty(asinAr[i])) {
      skuAr[i] = myntraFsnSkuMappingJson[asinAr[i]];
    }
  }

  let asin = asinAr.join(",");
  let sku = skuAr.join(",");
  return {
    orderId,
    startDate,
    endDate,
    billToName,
    billToAddress,
    billToState,
    billToZipCode,
    totalInvoiceAmount,
    asin,
    sku,
  };
}

function parseTataCliqInvoice(Texts) {
  let invoiceDate = "",
    orderId = "";

  for (let i in Texts) {
    i = parseInt(i);
    let { R } = Texts[i];

    if (orderId.length == 0) {
      let text = decodeAndExtractText(R[0].T, /order\s+no/gi);

      if (text.length > 0) {
        orderId = decodeAndExtractText(Texts[i + 1]?.R[0].T, /[\w-]+/g);
      }
    } else if (invoiceDate.length == 0) {
      let text = decodeAndExtractText(R[0].T, /invoice\s+date/gi);

      if (text?.length > 0) {
        text = decodeAndExtractText(Texts[i + 1]?.R[0].T, DATE_REGEX);
        invoiceDate = text;
      }
    }

    if (invoiceDate.length > 0 && orderId.length > 0) {
      break;
    }
  }

  const { startDate, endDate } = getEndDate(new Date(invoiceDate));

  const DELIVER_TO_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().startsWith("deliver to")
  );

  const FROM_TEXT_INDEX =
    DELIVER_TO_TEXT_INDEX +
    Texts.slice(DELIVER_TO_TEXT_INDEX).findIndex(({ R }) =>
      decodeAndExtractText(R[0].T).toLowerCase().startsWith("from")
    );

  let addressAr = Texts.slice(DELIVER_TO_TEXT_INDEX + 1, FROM_TEXT_INDEX - 2);
  for (let i in addressAr) {
    addressAr[i] = decodeAndExtractText(addressAr[i].R[0].T);
  }

  const billToName = addressAr.shift();
  const billToAddress = addressAr.join("");

  const stateZip = addressAr.at(-1);
  let billToZipCode = stateZip.match(/\d{6}/g)[0];
  let billToState = stateZip.match(/(?<=\()\w+(?=\))/g)[0];

  const NET_PRICE_RECOVERABLE_TEXT_INDEX = Texts.findIndex(({ R }) =>
    decodeAndExtractText(R[0].T).toLowerCase().endsWith("recoverable")
  );

  const ONLY_TOTAL_TEXT_INDEX =
    NET_PRICE_RECOVERABLE_TEXT_INDEX +
    Texts.slice(NET_PRICE_RECOVERABLE_TEXT_INDEX).findIndex(
      ({ R }) => decodeAndExtractText(R[0].T).toLowerCase() == "total"
    );

  const totalInvoiceAmount = Texts[ONLY_TOTAL_TEXT_INDEX + 1].R[0].T;
  let productListTextsAr = Texts.slice(
    NET_PRICE_RECOVERABLE_TEXT_INDEX + 1,
    ONLY_TOTAL_TEXT_INDEX
  );

  let asinAr = [];
  let skuAr = [];
  for (let { R } of productListTextsAr) {
    /*  */
    let asin = decodeAndExtractText(R[0].T, /\w{10}(?=\/)/g);
    if (asin.length > 0) {
      asinAr.push(asin);
    }
  }

  for (let i in asinAr) {
    if (amazonAsinSkuMappingJson.hasOwnProperty(asinAr[i])) {
      skuAr[i] = amazonAsinSkuMappingJson[asinAr[i]];
    } else {
      skuAr[i] = "NA";
    }
  }

  let asin = asinAr.join(",");
  let sku = skuAr.join(",");

  return {
    orderId,
    startDate,
    endDate,
    billToName,
    billToAddress,
    billToState,
    billToZipCode,
    totalInvoiceAmount,
    asin,
    sku,
  };
}

function parseJioMartInvoice(text) {
  const invoiceDate = text.match(
    /(?<=invoicedate:)(\d{1,4})[\s\p{Dash}.\/](\d{1,2}|\w+)[\s\p{Dash}.\/](\d{2,4})/gimu
  )[0];

  const orderId = text.match(/(?<=orderid:)\w{18}/gimu)[0];

  const billToName = text.match(/(?<=ShippingAddress)[A-Z][a-z]+/gmu)?.[0],
    billToState = titleCase(text.match(/(?<=\d{6},)\w+(?=,)/gimu)[0]),
    billToZipCode = text.match(/\d{6}(?=,\w+,)/gimu).at(-1);

  const totalInvoiceAmount = text.match(/(?<=total₹)[\d,.]+/gimu)[0];

  let invoiceDateArr = invoiceDate.split(/[\p{Dash}.\/]/gu);
  const { startDate, endDate } = getEndDate(
    new Date(invoiceDateArr[2], invoiceDateArr[1] - 1, invoiceDateArr[0])
  );

  console.log({ text });

  const asinAr = text.match(/(?<=sku:)[\w\s]+(?=\))/gimu);
  for (let i in asinAr) {
    asinAr[i] = asinAr[i].replaceAll(/\s+/g, "");
  }
  const asin = asinAr.join(",");

  let skuAr = [];
  for (let asin of asinAr) {
    if (amazonAsinSkuMappingJson.hasOwnProperty(asin)) {
      skuAr.push(amazonAsinSkuMappingJson[asin]);
    } else {
      skuAr.push("NA");
    }
  }

  const sku = skuAr.join(",");

  return {
    orderId,
    startDate,
    endDate,
    asin,
    sku,
    billToName,
    billToState,
    billToZipCode,
    totalInvoiceAmount,
  };
}

function parseAjioinvoice(Texts, text) {
  let invoiceDate = "",
    orderId = "",
    billToName = "",
    totalInvoiceAmount = "";

  let DATED_TEXT_INDEX = -1,
    RECIPIENT_ADDRESS_TEXT_INDEX = -1;

  for (let i in Texts) {
    i = parseInt(i);
    let { R } = Texts[i];

    if (billToName.length == 0) {
      let text = decodeAndExtractText(
        R[0].T,
        /(?<=recipient\saddress\W)[\w\s]+/gim
      );

      if (text?.length > 0) {
        billToName = titleCase(text.trim());
        RECIPIENT_ADDRESS_TEXT_INDEX = i;
      }
    }

    if (orderId.length == 0) {
      let text = decodeAndExtractText(R[0].T, /^order$/gim);

      if (text.length > 0) {
        orderId = decodeAndExtractText(Texts[i + 1]?.R[0].T, /\w+/g);
      }
    }
    if (invoiceDate.length == 0) {
      let text = decodeAndExtractText(R[0].T);

      if (text.toLowerCase().includes("dated")) {
        text = decodeAndExtractText(R[0].T, DATE_REGEX);
        invoiceDate = text;
        DATED_TEXT_INDEX = i;
      }
    }

    if (totalInvoiceAmount.length == 0) {
      let text = decodeAndExtractText(R[0].T);
      if (text.includes("Total Invoice Value")) {
        totalInvoiceAmount = decodeAndExtractText(Texts[i + 2]?.R[0].T, /\w+/g);
      }
    }
  }

  let invoiceDateArr = invoiceDate.split(/[\p{Dash}.\/]/gu);
  const { startDate, endDate } = getEndDate(
    new Date(invoiceDateArr[2], invoiceDateArr[1] - 1, invoiceDateArr[0])
  );

  let addressAr = Texts.slice(
    DATED_TEXT_INDEX + 1,
    RECIPIENT_ADDRESS_TEXT_INDEX
  );

  console.log(addressAr);
  for (let i in addressAr) {
    addressAr[i] = decodeAndExtractText(addressAr[i].R[0].T);
  }

  const billToAddress = addressAr.join(" ");
  const billToZipCode = billToAddress.match(/\d{6}/g).at(-1);
  let billToState = billToAddress
    .match(/\w+(?=\s+\d{6})/gm)
    ?.at(-1)
    .substring(0, 2);

  if (stateMappingJson.hasOwnProperty(billToState)) {
    billToState = stateMappingJson[billToState];
  }

  const asinAr = text.match(/(?<=\()\d{13}(?=\))/gm);
  const asin = asinAr?.join(",");

  let skuAr = [];
  for (let asin of asinAr) {
    if (ajioAsinSkuMappingJson.hasOwnProperty(asin)) {
      skuAr.push(ajioAsinSkuMappingJson[asin]);
    } else {
      skuAr.push("NA");
    }
  }

  const sku = skuAr.join(",");

  return {
    orderId,
    startDate,
    endDate,
    billToName,
    billToState,
    billToAddress,
    billToZipCode,
    asin,
    sku,
    totalInvoiceAmount,
  };
}

async function parsePdfData(filePath) {
  const PDFParser = await import("pdf2json/pdfparser.js");
  const pdfParser = new PDFParser.default();

  const extractedData = [];
  let extractedObj = {};

  let platform = "";

  pdfParser.on("pdfParser_dataError", errData =>
    console.error(errData.parserError)
  );

  async function readPDF() {
    return new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataReady", pdfData => {
        // pdfData.Pages.forEach(page => {
        //   // console.log(page);

        //
        // });

        const { Texts } = pdfData.Pages[0];
        let text = "";
        Texts.forEach(({ R }) => {
          text += R[0].T;
        });
        text = decodeURIComponent(text);
        console.log({ text });

        var fs = require("fs");
        fs.writeFile(
          "test.txt",
          JSON.stringify(pdfData.Pages[0]),
          function (err) {
            if (err) {
              console.log(err);
            }
          }
        );

        if (Texts.length == 0) {
          resolve(`Could not extract text from ${filePath}`);
        }

        if (
          decodeAndExtractText(Texts[0].R[0].T).includes(
            "Thank you for shopping with us"
          )
        ) {
          platform = "Nasher Miles";
          extractedObj = parseNasherMilesInvoice(Texts);
        } else if (
          Texts.some(({ R }) => decodeAndExtractText(R[0].T).includes("Amazon"))
        ) {
          platform = "Amazon";
          extractedObj = parseAmazonInvoice(Texts);
        } else if (
          Texts.some(({ R }) =>
            decodeAndExtractText(R[0].T)
              .toLowerCase()
              .includes("www.myntra.com")
          )
        ) {
          platform = "Myntra";
          extractedObj = parseMyntraInvoice(Texts, text);
        } else if (
          Texts.some(({ R }) =>
            decodeAndExtractText(R[0].T).includes("Flipkart")
          )
        ) {
          platform = "Flipkart";
          extractedObj = parseFlipkartInvoice(Texts, text);
        } else if (
          Texts.some(({ R }) =>
            decodeAndExtractText(R[0].T).toLowerCase().includes("tatacliq")
          )
        ) {
          platform = "TataCliq";
          extractedObj = parseTataCliqInvoice(Texts);
        } else if (
          Texts.some(({ R }) =>
            decodeAndExtractText(R[0].T).toLowerCase().includes("ajio")
          )
        ) {
          platform = "Ajio";
          extractedObj = parseAjioinvoice(Texts, text);
        } else if (text.toLowerCase().includes("jiomart")) {
          platform = "JioMart";
          extractedObj = parseJioMartInvoice(text);
        } else if (text.match(/od\w{18}/gi) !== null) {
          platform = "Flipkart";
          extractedObj = parseFlipkartWithoutFsnInvoice(text);
        }

        if (
          Object.values(extractedObj).every(
            value => value === null || value === undefined
          ) ||
          Object.keys(extractedObj).length === 0
        ) {
          console.log({ extractedObj, platform });
          resolve(`Could not parse values from ${filePath}`);
        }

        function getResultObj(obj) {
          const {
            orderId,
            startDate,
            endDate,
            billToName,
            billToState,
            billToZipCode,
            billToAddress,
            sku,
            asin,
            totalInvoiceAmount,
          } = obj;

          return {
            "Customer name": billToName,
            Platform: platform,
            "Order No": orderId,
            sku: sku?.trim(),
            "Start date": startDate,
            "END date": endDate,
            "Total warranty (in months)": 18 /* 18 is default value */,
            "ASIN for feedback": asin?.trim(),
            State: billToState,
            "Zip code": billToZipCode,
            Value: totalInvoiceAmount,
          };
        }

        const result = [];
        if (extractedObj instanceof Array) {
          for (let obj of extractedObj) {
            result.push(getResultObj(obj));
          }
        } else {
          result.push(getResultObj(extractedObj));
        }

        resolve(result);
      });
      pdfParser.on("pdfParser_dataError", reject);
    });
  }

  pdfParser.loadPDF(filePath);
  extractedObj = await readPDF();

  console.log(extractedObj);

  return extractedObj;
}

module.exports = parsePdfData;
