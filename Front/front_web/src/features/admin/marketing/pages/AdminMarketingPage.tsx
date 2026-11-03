import { useCallback, useEffect, useState } from "react";
import { BOOST_GOAL_LABELS, BOOST_STATUS_LABELS, BOOST_STATUS_TONES, type Boost, type BoostSettings } from "../../../../entities/boost";
import { formatPrice } from "../../../../entities/product";
import { CAMPAIGN_STATE_LABELS, type Campaign } from "../../../../entities/promotion";
import { ApiError } from "../../../../shared/api";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button, Input, StatusBadge, TextArea } from "../../../../shared/ui";
import { AccountPage, AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { AdminHeader, AdminNav } from "../../shared";
import { createCampaign, fetchActiveBoosts, fetchAllCampaigns, fetchBoostSettings, saveBoostSettings, updateCampaign } from "../api/adminMarketing.api";
import styles from "./AdminMarketingPage.module.css";

const DAY = 24 * 3600 * 1000;
const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const integer = new Intl.NumberFormat("fr-FR");

// ─────────────────────────────────────────────
//  Promotions — /admin/promotions
//  L'administration ne valide rien : chaque boutique lance seule ses
//  promotions et ses boosts. Ici, les campagnes de la plateforme, le prix
//  des boosts et les boosts en cours (un abus se traite au support).
// ─────────────────────────────────────────────
export const AdminMarketingPage = () => {
  useDocumentTitle("Promotions et boosts");
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const done = (message: string) => {
    setFeedback(message);
    setVersion((value) => value + 1);
  };

  const loadCampaigns = useCallback((signal: AbortSignal) => fetchAllCampaigns(signal), []);
  const campaigns = useResource<Campaign[]>(loadCampaigns, [], `campaigns:${version}`);
  const loadBoosts = useCallback((signal: AbortSignal) => fetchActiveBoosts(signal), []);
  const boosts = useResource<Boost[]>(loadBoosts, [], `boosts:${version}`);
  const loadSettings = useCallback((signal: AbortSignal) => fetchBoostSettings(signal), []);
  const settings = useResource<BoostSettings | null>(loadSettings, null, `settings:${version}`);

  return (
    <AccountPage>
      <AdminHeader
        title="Promotions et boosts"
        lede="Les boutiques planifient et lancent seules leurs promotions et leurs boosts. La plateforme crée ses campagnes, règle le prix des boosts et traite les signalements (« Faux prix barré ») au support."
        trail={[{ label: "Promotions et boosts" }]}
      />
      <AdminNav />
      <div className={styles.page}>
        {feedback ? <Alert tone="success">{feedback}</Alert> : null}

        <AccountPanel title="Campagnes de la plateforme" description="Une page dédiée, où les boutiques inscrivent leurs offres avec au moins la remise demandée. 30 jours au plus.">
          <CampaignForm onDone={done} />
          {campaigns.data.length > 0 ? (
            <ul className={styles.list}>
              {campaigns.data.map((campaign) => (
                <li key={campaign.id} className={styles.item}>
                  <div>
                    <strong>{campaign.nom}</strong>
                    <span className={styles.muted}>
                      {` · ${CAMPAIGN_STATE_LABELS[campaign.state]} · du ${dayFormat.format(new Date(campaign.startDate))} au ${dayFormat.format(new Date(campaign.endDate))} · −${campaign.minDiscount} % au moins · ${campaign.offerCount ?? 0} offre(s)`}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <a className={styles.link} href={`/campagnes/${campaign.slug}`}>
                      Voir la page
                    </a>
                    {campaign.state !== "ended" ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void updateCampaign(campaign.id, { actif: false })
                            .then(done)
                            .catch((caught: unknown) => setFeedback((caught as Error).message))
                        }
                      >
                        Clore
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </AccountPanel>

        <AccountPanel title="Prix des boosts" description="Valent pour les prochains boosts ; un boost en cours garde le prix de son lancement.">
          {settings.data ? <SettingsForm settings={settings.data} onDone={done} /> : settings.error ? <Alert tone="danger">{settings.error}</Alert> : null}
        </AccountPanel>

        <AccountPanel title="Boosts en cours" description="Pour information : un boost se lance sans validation. Une boutique qui abuse se sanctionne au support (« Promotions suspendues »).">
          {boosts.data.length === 0 ? (
            <p className={styles.muted}>Aucun boost en cours.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Boost</th>
                    <th scope="col">Objectif</th>
                    <th scope="col">Budget</th>
                    <th scope="col">Affichages</th>
                    <th scope="col">Visites</th>
                    <th scope="col">État</th>
                  </tr>
                </thead>
                <tbody>
                  {boosts.data.map((boost) => (
                    <tr key={boost.id}>
                      <td>{`${boost.kindLabel} — ${boost.promotion?.nom ?? boost.offers.map((offer) => offer.name).join(", ")}`}</td>
                      <td>{BOOST_GOAL_LABELS[boost.goal]}</td>
                      <td>{`${formatPrice(boost.spent)} / ${formatPrice(boost.reserved)}`}</td>
                      <td>{integer.format(boost.totals.impressions)}</td>
                      <td>{integer.format(boost.totals.visits)}</td>
                      <td>
                        <StatusBadge tone={BOOST_STATUS_TONES[boost.status]}>{BOOST_STATUS_LABELS[boost.status]}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AccountPanel>
      </div>
    </AccountPage>
  );
};

const CampaignForm = ({ onDone }: { onDone: (message: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(() => toDay(new Date(Date.now() + DAY)));
  const [end, setEnd] = useState(() => toDay(new Date(Date.now() + 15 * DAY)));
  const [minDiscount, setMinDiscount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Nouvelle campagne
        </Button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await createCampaign({
        nom: nom.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        startDate: new Date(`${start}T00:00:00`).toISOString(),
        endDate: new Date(`${end}T23:59:00`).toISOString(),
        minDiscount: Number(minDiscount),
      });
      setOpen(false);
      setNom("");
      setDescription("");
      onDone(message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "La campagne n'a pas été créée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <Input label="Nom" value={nom} onChange={(event) => setNom(event.target.value)} placeholder="Ex. Saison des pluies" />
      <TextArea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      <div className={styles.row}>
        <Input label="Début" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        <Input label="Fin" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        <Input label="Remise minimale (%)" type="number" min={5} max={70} value={minDiscount} onChange={(event) => setMinDiscount(event.target.value)} />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className={styles.actions}>
        <Button onClick={() => void submit()} isLoading={busy} disabled={nom.trim().length < 2}>
          Créer la campagne
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
};

const SettingsForm = ({ settings, onDone }: { settings: BoostSettings; onDone: (message: string) => void }) => {
  const [values, setValues] = useState({
    costPerVisit: String(settings.costPerVisit),
    costPerThousandViews: String(settings.costPerThousandViews),
    monthlyCredits: String(settings.monthlyCredits),
    minVisitsPerDay: String(settings.minVisitsPerDay),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setValues({
      costPerVisit: String(settings.costPerVisit),
      costPerThousandViews: String(settings.costPerThousandViews),
      monthlyCredits: String(settings.monthlyCredits),
      minVisitsPerDay: String(settings.minVisitsPerDay),
    });
  }, [settings]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await saveBoostSettings({
          costPerVisit: Number(values.costPerVisit),
          costPerThousandViews: Number(values.costPerThousandViews),
          monthlyCredits: Number(values.monthlyCredits),
          minVisitsPerDay: Number(values.minVisitsPerDay),
        })
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className={styles.form}>
      <div className={styles.row}>
        <Input label="Prix d'une visite (GNF)" type="number" min={1} value={values.costPerVisit} onChange={set("costPerVisit")} />
        <Input label="Prix de 1 000 affichages (GNF)" type="number" min={1} value={values.costPerThousandViews} onChange={set("costPerThousandViews")} />
        <Input label="Crédits offerts par mois (GNF)" type="number" min={0} value={values.monthlyCredits} onChange={set("monthlyCredits")} />
        <Input
          label="Visites minimum par jour"
          type="number"
          min={1}
          value={values.minVisitsPerDay}
          onChange={set("minVisitsPerDay")}
          hint={`Budget minimum : ${formatPrice(Number(values.costPerVisit) * Number(values.minVisitsPerDay) || 0)} par jour.`}
        />
      </div>
      <p className={styles.muted}>{`Audience personnalisée : ${settings.minAudience} clients au moins (réglage du serveur).`}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button onClick={() => void save()} isLoading={busy}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
};
