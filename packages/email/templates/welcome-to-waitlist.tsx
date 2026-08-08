import type { ReactElement } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

const baseUrl = process.env.NEXT_PUBLIC_APEX_URL
  ? `https://${process.env.NEXT_PUBLIC_APEX_URL}`
  : "";

const WelcomeEmail = (): ReactElement => (
  <Html>
    <Head />
    <Preview>
      Welcome to the weekly hasToggle digest - your journey to web development
      mastery begins here!
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
              Welcome to the weekly hasToggle digest! I'm thrilled to have you
              onboard.
            </Text>
            <Text className="text-left text-[#525f7f] text-base leading-6">
              I'm Eric — a web developer and coach passionate about helping
              beginners level up their coding skills. With years of experience
              building projects and mentoring others in modern web development,
              I'm excited to share actionable insights with you each week.
            </Text>
            <Text className="text-left text-[#525f7f] text-base leading-6">
              Here's what you can expect in the digest:
            </Text>
            <ul className="list-disc pl-6 text-[#525f7f] text-base leading-6">
              <li>JavaScript basics and deep dives to sharpen your skills</li>
              <li>
                React/Next.js tips and tutorials to stay ahead of the curve
              </li>
              <li>
                Coding challenges to prepare for job interviews and improve
                problem-solving
              </li>
              <li>
                Practical advice to boost your productivity and creativity
              </li>
            </ul>
            <Text className="mt-4 text-left text-[#525f7f] text-base leading-6">
              Feel free to hit reply if you have any questions or suggestions. I
              read every email.
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

WelcomeEmail.PreviewProps = {};

export default WelcomeEmail;
