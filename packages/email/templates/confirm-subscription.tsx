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
      Thanks for signing up. Click the link below to confirm your subscription
      and you&apos;ll be on your way.
    </Preview>
    <Tailwind>
      <Body className="bg-[#f6f9fc] font-sans">
        <Container className="mx-auto mb-16 bg-white py-5 pb-12">
          <Section className="px-12">
            <Section className="text-center">
              <Img
                alt="hasToggle logo"
                className="mr-2 inline-block h-[52px] w-[39px] rounded-md"
                height="52"
                src={`${baseUrl}/logo.png`}
                width="39"
              />
              <Img
                alt="hasToggle lettering"
                className="inline-block h-6"
                height="24"
                src={`${baseUrl}/hasToggle.png`}
                width="118"
              />
            </Section>
            <Hr className="my-5 border-[#e6ebf1]" />
            <Text className="text-left text-[#525f7f] text-base leading-6">
              Thanks for signing up. Click the link below to confirm your
              subscription and you&apos;ll be on your way.
            </Text>
            <Link
              className="mx-0 my-1.5 inline-block rounded bg-[#1677be] px-4 py-3 text-center text-base text-white leading-6 no-underline"
              href={`${baseUrl}/api/confirmed?token=${token}`}
            >
              Confirm your subscription
            </Link>
            <Text className="text-left text-[#525f7f] text-base leading-6">
              It's good to have you!
            </Text>
            <Text className="text-left text-[#525f7f] text-base leading-6">
              — Eric
            </Text>
            <Hr className="my-5 border-[#e6ebf1]" />
            <Text className="text-[#8898aa] text-xs leading-4">
              hasToggle, Limberger Straße 40, 49080 Osnabrück, Germany
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
