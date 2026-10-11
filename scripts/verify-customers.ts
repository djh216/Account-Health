import { readFileSync, existsSync } from "node:fs";
import {
  customersMatchingAccountName,
  extractEmails,
  extractPhones,
  parseCustomerCsv,
} from "../src/lib/customer-directory";

const failures: string[] = [];

function expect(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

const sample = `Name,Phone Numbers,Emails,Delivery Instructions (Places),LID (Places),Territory (Places)
3rd and Ferry,Lauren (610) 248-1117,laureng@belmonthosp.example,"Deliver through rear alley, right side ramp",62129,Northeast PA
Alba,approvals: 610-350-7502 Frank,frhurley@hotmail.example,Through the front door. Call Frank 1 hour prior to arrival.,61158,Southern Susquehanna Valley
Alta Via,Mary 203-435-0539,Email: Email hmurray@bigburrito.example,"Back door, behind Coffee Tree, next to wood cage",92233,Pittsburgh
Del Friscos,"610-209-5555, Joel Barraza : 267-858-7519",Dfphbevops@ldry.example,,59673,Philadelphia
Barclay,Kevin Lundell: Kevin Lundell: 215-732-7560,Email: Email: kevin.lundell@starr.example,Through the back door on Moravian Street,50780,Philadelphia
Bistecca,"",buyer@momentum.example,Delivery through casino receiving entrance,70047,Northeast PA
Frogtown,Kerra 570-977-4476,info@the frogtown.example,Delivery through front ramp entrance,52790,Northeast PA
Cry Baby,Phone: Guy (215) 720-5921,Email: Email Email guy.smith@gmail.example,delivery through side door,95747,Philadelphia
Her Place,1 (484) 334-5747- Nicole,herplace@gmail.example,through front door,109483,Philadelphia
Cigar Code,+1 (267) 858-6925,"",Front door. Please Call Before Delivery.,103354,Philadelphia
Beaumont,Phone: 6105422025,"","Delivery to loading dock, press call button",49809,
GoggleWorks,(610) 374-4600,arts@goggleworks.example,"Park in the lot, then use the back entrance",,Southern Susquehanna Valley
Same Lid,Trenton 484-356-8508,first@example.com,first note,111,Philadelphia
Same Lid,Trenton 484-356-8508,second@example.com,later note,111,Philadelphia
,555-111-2222,noname@example.com,should skip,999,Philadelphia
`;

const parsed = parseCustomerCsv("outfield-accounts.csv", sample);
expect(parsed.ok, parsed.ok ? "" : parsed.error);
if (parsed.ok) {
  expect(parsed.skipped === 1, `expected 1 skipped row, got ${parsed.skipped}`);
  expect(parsed.replacedDuplicateLids === 1, `expected 1 replaced lid, got ${parsed.replacedDuplicateLids}`);
  const byName = new Map(parsed.directory.customers.map((customer) => [customer.name, customer]));

  const ferry = byName.get("3rd and Ferry");
  expect(ferry?.phones[0]?.display === "(610) 248-1117", `ferry phone ${ferry?.phones[0]?.display}`);
  expect(ferry?.phones[0]?.label === "Lauren", `ferry label ${ferry?.phones[0]?.label}`);
  expect(ferry?.emails[0] === "laureng@belmonthosp.example", `ferry email ${ferry?.emails[0]}`);
  expect(ferry?.deliveryInstructions.includes("rear alley, right side ramp"), "ferry delivery lost a comma");
  expect(ferry?.lid === "62129" && ferry.territory === "Northeast PA", "ferry lid/territory");

  const alba = byName.get("Alba");
  expect(alba?.phones[0]?.label === "Frank", `alba label ${alba?.phones[0]?.label}`);
  expect(alba?.phones[0]?.digits === "6103507502", `alba digits ${alba?.phones[0]?.digits}`);

  const alta = byName.get("Alta Via");
  expect(alta?.emails[0] === "hmurray@bigburrito.example", `alta email ${alta?.emails.join(",")}`);
  expect(alta?.phones[0]?.label === "Mary", `alta label ${alta?.phones[0]?.label}`);

  const del = byName.get("Del Friscos");
  expect(del?.phones.length === 2, `del phones ${del?.phones.length}`);
  expect(del?.phones[1]?.label === "Joel Barraza", `del label ${del?.phones.map((phone) => phone.label).join("|")}`);
  expect(del?.phones[0]?.digits === "6102095555", `del first ${del?.phones[0]?.digits}`);

  const barclay = byName.get("Barclay");
  expect(barclay?.phones[0]?.label === "Kevin Lundell", `barclay label ${barclay?.phones[0]?.label}`);
  expect(barclay?.emails[0] === "kevin.lundell@starr.example", `barclay email ${barclay?.emails[0]}`);

  const frog = byName.get("Frogtown");
  expect(frog?.emails[0] === "info@thefrogtown.example", `frog email ${frog?.emails.join(",")}`);

  const cry = byName.get("Cry Baby");
  expect(cry?.phones[0]?.label === "Guy", `cry label ${cry?.phones[0]?.label}`);
  expect(cry?.emails[0] === "guy.smith@gmail.example", `cry email ${cry?.emails[0]}`);

  const her = byName.get("Her Place");
  expect(her?.phones[0]?.digits === "4843345747", `her digits ${her?.phones[0]?.digits}`);
  expect(her?.phones[0]?.label === "Nicole", `her label ${her?.phones[0]?.label}`);

  const cigar = byName.get("Cigar Code");
  expect(cigar?.phones[0]?.display === "(267) 858-6925", `cigar phone ${cigar?.phones[0]?.display}`);

  const beaumont = byName.get("Beaumont");
  expect(beaumont?.phones[0]?.digits === "6105422025", `beaumont digits ${beaumont?.phones[0]?.digits}`);
  expect(beaumont?.territory === "", "beaumont territory should stay blank");

  const goggle = byName.get("GoggleWorks");
  expect(goggle?.lid === "", "goggle lid should stay blank");
  expect(goggle?.id.startsWith("name:"), `goggle id ${goggle?.id}`);

  const same = parsed.directory.customers.filter((customer) => customer.name === "Same Lid");
  expect(same.length === 1 && same[0]?.emails[0] === "second@example.com", "duplicate lid should keep the later row");
  expect(same[0]?.deliveryInstructions === "later note", "duplicate lid should keep later delivery notes");

  expect(
    !parsed.directory.customers.some((customer) => customer.lid === "999"),
    "blank names should be skipped",
  );

  const matches = customersMatchingAccountName(parsed.directory, "3rd and Ferry");
  expect(matches.length === 1, "account name lookup should find the customer");
}

const missing = parseCustomerCsv("bad.csv", "Account,Phone\nA,1\n");
expect(!missing.ok, "missing columns should fail");
if (!missing.ok) {
  expect(missing.error.includes("Phone Numbers"), `error should name missing columns: ${missing.error}`);
  expect(missing.error.includes("LID (Places)"), `error should name LID: ${missing.error}`);
}

const empty = parseCustomerCsv("empty.csv", `${"Name,Phone Numbers,Emails,Delivery Instructions (Places),LID (Places),Territory (Places)"}\n`);
expect(!empty.ok, "header-only file should fail");

expect(extractPhones("Erin 5707939046")[0]?.digits === "5707939046", "compact phone");
expect(extractEmails("Email: Email hmurray@bigburrito.example")[0] === "hmurray@bigburrito.example", "prefixed email");

const uploadPath = process.argv[2];
if (uploadPath && existsSync(uploadPath)) {
  const text = readFileSync(uploadPath, "utf8");
  const uploaded = parseCustomerCsv("Outfield_Accounts.csv", text);
  expect(uploaded.ok, uploaded.ok ? "" : uploaded.error);
  if (uploaded.ok) {
    expect(uploaded.directory.customers.length >= 300, `expected a full export, got ${uploaded.directory.customers.length}`);
    const lids = uploaded.directory.customers.map((customer) => customer.lid).filter(Boolean);
    expect(new Set(lids).size === lids.length, "uploaded LIDs should be unique");
    for (const customer of uploaded.directory.customers) {
      expect(customer.name.trim().length > 0, "blank customer name");
      const rawDigits = customer.phonesRaw.replace(/\D/g, "");
      if (rawDigits.length >= 10) {
        expect(
          customer.phones.length > 0,
          `phone not parsed for ${customer.name}: ${customer.phonesRaw}`,
        );
      }
      if (customer.emailsRaw.includes("@")) {
        expect(
          customer.emails.length > 0,
          `email not parsed for ${customer.name}: ${customer.emailsRaw}`,
        );
      }
    }
    const territories = new Set(uploaded.directory.customers.map((customer) => customer.territory).filter(Boolean));
    expect(territories.has("Philadelphia") && territories.has("Pittsburgh"), `territories ${[...territories].join(", ")}`);
    console.log(
      `Uploaded file: ${uploaded.directory.customers.length} accounts, ${territories.size} territories, ${uploaded.skipped} skipped`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("OK — customer CSV import");
