import { Suspense } from "react";
import RequestForm from "./request-form";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <RequestForm />
    </Suspense>
  );
}
