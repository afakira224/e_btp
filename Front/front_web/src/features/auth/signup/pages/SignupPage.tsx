import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../../shared";
import { SignupForm } from "../components/SignupForm";
import { SignupSuccess } from "../components/SignupSuccess";
import type { SignupOutcome } from "../hooks/useSignup";

export const SignupPage = () => {
  const [outcome, setOutcome] = useState<SignupOutcome | null>(null);

  const handleRegistered = useCallback(
    (result: SignupOutcome) => setOutcome(result),
    []
  );

  if (outcome) {
    return (
      <AuthLayout
        eyebrow="Inscription — 02"
        title="Vérifiez votre email"
        subtitle="Dernière étape avant l'accès."
      >
        <SignupSuccess email={outcome.email} verifyLink={outcome.verifyLink} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Inscription — 01"
      title="Créer un compte"
      subtitle="Ouvrez votre compte client en quelques informations."
      footer={
        <>
          Vous avez déjà un compte ? <Link to="/login">Se connecter</Link>
        </>
      }
    >
      <SignupForm onRegistered={handleRegistered} />
    </AuthLayout>
  );
};
