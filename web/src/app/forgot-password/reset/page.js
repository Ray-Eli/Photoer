import { Suspense } from "react";
import ResetForm from "./reset-form";

export default function ForgotPasswordResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
