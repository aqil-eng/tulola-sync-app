import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Tulola Shopify App">
      <s-section heading={`Connected to ${shop}`}>
        <s-paragraph>
          This app bridges Shopify to <strong>tulola-integration</strong>:
          pushing unregistered PRISM customers into Shopify, reflecting
          computed customer segments as tags, and forwarding online orders
          back for segmentation.
        </s-paragraph>
        <s-paragraph>
          Nothing beyond installation and this placeholder page is wired up
          yet — see <strong>AGENTS.md</strong> for the plan and open design
          questions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
