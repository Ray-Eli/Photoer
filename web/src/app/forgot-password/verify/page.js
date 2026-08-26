import { Suspense } from "react";
import VerifyForm from "./verify-form";

export default function ForgotPasswordVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
