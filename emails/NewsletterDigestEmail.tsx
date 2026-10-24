import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type NewsletterDigestStory = {
  title: string;
  summary: string;
  sourceLabel: string;
  /** Full story page in the app. */
  storyUrl: string;
  /** Story page with the video-script options open. */
  scriptUrl: string;
  /** Absolute http(s) URL; the story renders text-only when null. */
  imageUrl: string | null;
};

export type NewsletterDigestEmailProps = {
  newsletterName: string;
  editionDateLabel: string;
  stories: NewsletterDigestStory[];
  manageUrl: string;
  unsubscribeUrl: string;
};

export function NewsletterDigestEmail({
  newsletterName,
  editionDateLabel,
  stories,
  manageUrl,
  unsubscribeUrl,
}: NewsletterDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${newsletterName} — ${editionDateLabel} (${String(stories.length)} stories)`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{newsletterName}</Heading>
          <Text style={meta}>{editionDateLabel}</Text>
          <Hr style={hr} />
          {stories.map((story) => (
            <Section key={story.storyUrl} style={storyBlock}>
              {story.imageUrl ? (
                <Link href={story.storyUrl}>
                  <Img
                    src={story.imageUrl}
                    alt={story.title}
                    width="512"
                    style={storyImage}
                  />
                </Link>
              ) : null}
              <Heading as="h2" style={h2}>
                <Link href={story.storyUrl} style={link}>
                  {story.title}
                </Link>
              </Heading>
              <Text style={source}>{story.sourceLabel}</Text>
              <Text style={paragraph}>{story.summary}</Text>
              <Text style={actions}>
                <Link href={story.storyUrl} style={primaryAction}>
                  Read full story
                </Link>
                <Link href={story.scriptUrl} style={secondaryAction}>
                  Create video script
                </Link>
              </Text>
            </Section>
          ))}
          <Hr style={hr} />
          <Text style={footer}>
            <Link href={manageUrl}>Manage newsletter</Link>
            {" · "}
            <Link href={unsubscribeUrl}>Unsubscribe</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f6f6",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
  backgroundColor: "#ffffff",
};

const h1 = { fontSize: "22px", fontWeight: "600", margin: "0 0 8px" };
const h2 = { fontSize: "17px", fontWeight: "600", margin: "0 0 4px" };
const meta = { color: "#666", fontSize: "14px", margin: "0 0 16px" };
const source = { color: "#888", fontSize: "12px", margin: "0 0 8px" };
const paragraph = { fontSize: "14px", lineHeight: "22px", margin: "0 0 16px" };
const storyBlock = { marginBottom: "20px" };
const actions = { margin: "0 0 8px", lineHeight: "36px" };
const actionBase = {
  display: "inline-block",
  padding: "0 14px",
  borderRadius: "6px",
  fontSize: "13px",
  fontWeight: "600",
  textDecoration: "none",
  marginRight: "8px",
};
const primaryAction = {
  ...actionBase,
  backgroundColor: "#111",
  color: "#fff",
};
const secondaryAction = {
  ...actionBase,
  border: "1px solid #c85d3f",
  color: "#c85d3f",
};
const storyImage = {
  display: "block",
  width: "100%",
  maxWidth: "512px",
  height: "auto",
  borderRadius: "6px",
  margin: "0 0 12px",
};
const link = { color: "#111", textDecoration: "underline" };
const hr = { borderColor: "#eee", margin: "20px 0" };
const footer = { fontSize: "12px", color: "#666" };
