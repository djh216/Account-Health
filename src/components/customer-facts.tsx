"use client";

import { useState } from "react";
import { Check, Copy, Mail, Phone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  phoneTelHref,
  type CustomerRecord,
} from "@/lib/customer-directory";

export function CustomerFacts({ customer }: { customer: CustomerRecord }) {
  const phoneCopy = customer.phones
    .map((phone) => [phone.label, phone.display].filter(Boolean).join(" "))
    .join("\n");
  const emailCopy = customer.emails.join("\n");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
          {customer.territory || "No territory"}
        </span>
        <span>LID {customer.lid || "—"}</span>
      </div>

      <section className="rounded-xl border border-primary/15 bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <Truck className="size-3.5" />
            Delivery instructions
          </div>
          <CopyButton value={customer.deliveryInstructions} label="Copy" />
        </div>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
          {customer.deliveryInstructions || "No delivery instructions on file."}
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Phone className="size-3.5 text-muted-foreground" />
            Phone numbers
          </h3>
          <CopyButton value={phoneCopy || customer.phonesRaw} label="Copy" />
        </div>
        {customer.phones.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {customer.phones.map((phone) => (
              <li key={phone.digits} className="text-sm">
                <a className="font-medium text-primary underline-offset-4 hover:underline" href={phoneTelHref(phone.digits)}>
                  {phone.display}
                </a>
                {phone.label ? (
                  <span className="text-muted-foreground"> · {phone.label}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {customer.phonesRaw || "No phone number on file."}
          </p>
        )}
        {customer.phonesRaw && customer.phones.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Uploaded: {customer.phonesRaw}</p>
        ) : null}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Mail className="size-3.5 text-muted-foreground" />
            Emails
          </h3>
          <CopyButton value={emailCopy || customer.emailsRaw} label="Copy" />
        </div>
        {customer.emails.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {customer.emails.map((email) => (
              <li key={email} className="text-sm">
                <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${email}`}>
                  {email}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {customer.emailsRaw || "No email on file."}
          </p>
        )}
        {customer.emailsRaw && customer.emails.length > 0 && customer.emailsRaw.toLowerCase() !== customer.emails.join(", ") ? (
          <p className="mt-2 text-xs text-muted-foreground">Uploaded: {customer.emailsRaw}</p>
        ) : null}
      </section>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
