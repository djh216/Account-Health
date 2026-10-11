import { redirect } from "next/navigation";

export default function ProductSalesPage() {
  redirect("/?view=trends&grain=product");
}
