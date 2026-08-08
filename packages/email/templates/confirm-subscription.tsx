import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

const fallbackBaseUrl = process.env.NEXT_PUBLIC_APEX_URL
  ? `https://${process.env.NEXT_PUBLIC_APEX_URL}`
  : "";

/**
 * The lockup is served as a PNG because no email client can be relied on to
 * render SVG. `bun render-brand` in @repo/design-system writes it at twice this
 * width, so it stays sharp on a retina screen.
 */
const LOCKUP_WIDTH = 160;
const LOCKUP_HEIGHT = 31;

interface ConfirmSubscriptionProps {
  readonly baseUrl?: string;
  readonly token: string;
}

const ConfirmSubscription = ({
  token,
  baseUrl = fallbackBaseUrl,
}: ConfirmSubscriptionProps) => (
  <Html>
    <Head />
    <Preview>
      Confirm this address and we&apos;ll book half an hour to set memorynine up
      with you.
    </Preview>
    <Tailwind>
      <Body className="bg-[#f6f5f1] font-sans">
        <Container className="mx-auto mb-16 bg-white py-5 pb-12">
          <Section className="px-12">
            <Section>
              <Img
                alt="memorynine"
                height={LOCKUP_HEIGHT}
                src={`${baseUrl}/brand/lockup.png`}
                width={LOCKUP_WIDTH}
              />
            </Section>
            <Hr className="my-5 border-[#cdcac2]" />
            <Text className="text-left text-[#4b4f56] text-base leading-6">
              You asked us to walk you through memorynine. Confirm this address
              and we&apos;ll be in touch to find half an hour — your own client,
              your own questions.
            </Text>
            <Link
              className="mx-0 my-1.5 inline-block rounded bg-[#14161a] px-4 py-3 text-center text-base text-white leading-6 no-underline"
              href={`${baseUrl}/api/confirmed?token=${token}`}
            >
              Confirm this address
            </Link>
            <Text className="text-left text-[#4b4f56] text-base leading-6">
              If you didn&apos;t ask for this, ignore it — nothing happens until
              you confirm.
            </Text>
            <Text className="text-left text-[#4b4f56] text-base leading-6">
              — Eric
            </Text>
            <Hr className="my-5 border-[#cdcac2]" />
            <Text className="text-[#65635d] text-xs leading-4">
              memorynine, Limberger Straße 40, 49080 Osnabrück, Germany
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

ConfirmSubscription.PreviewProps = {
  baseUrl: "https://example.com",
  token: "abc123",
};

export default ConfirmSubscription;
