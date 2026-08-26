import { Suspense } from "react";
import VerifyForm from "./verify-form";

export default function RegisterVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
