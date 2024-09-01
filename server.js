const express = require('express');
const app = express();
const axios = require('axios');
const twilio = require('twilio');
const crypto = require('crypto');
const dotenv = require('dotenv').config();
const cors = require('cors');

// const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(express.json());
app.use(express.urlencoded());
app.use(cors());

let otpStorage = {};  

async function sendOTP(phoneNumber) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await client.messages.create({
        body: `Your verification code is ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,  
    });
    return otp;
}


app.post('/request-otp', async (req, res) => {
    const { phoneNumber } = req.body;
    const otp = await sendOTP(phoneNumber);
    otpStorage[phoneNumber] = otp;
    res.status(200).send('OTP sent');
});

app.post('/verify-otp', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    if (otpStorage[phoneNumber] === otp) {
        delete otpStorage[phoneNumber];
        const customer = await createOrLoginCustomer(phoneNumber);
        res.status(200).send(customer);
    } else {
        res.status(401).send('Invalid OTP');
    }
});


app.post('/verify', async (req, res) => {
  const { phoneNumber } = req.body;
  // const { phoneNumber, otp } = req.body;
  // const otpRecord = await OTP.findOne({ phoneNumber, otp });

  // if (!otpRecord) {
  //   return res.status(400).json({ message: 'Invalid or expired OTP' });
  // }

  let result = await createOrLoginCustomer(phoneNumber);

  res.json(result);

 
});


async function createOrLoginCustomer(phoneNumber) {
  // Convert the phone number to a string and add the country code
  const formattedPhoneNumber = `+1${String(phoneNumber)}`; // Replace +1 with the appropriate country code if necessary

  // Fake email using the phone number
  const email = `${phoneNumber}@${process.env.SHOPIFY_STORE_URL}`;

  const password = 'tenzin';

  // GraphQL query for customer login
  const customerAccessTokenCreateQuery = `
  mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
          customerAccessToken {
              accessToken
              expiresAt
          }
          userErrors {
              field
              message
          }
      }
  }`;

  // GraphQL query for creating a customer
  const createCustomerQuery = `
  mutation customerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
          customer {
              id
          }
          userErrors {
              field
              message
          }
      }
  }`;

  try {
    // Try to generate an access token for the customer (assuming they already exist)
    let response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/api/2024-07/graphql.json`,
      {
        query: customerAccessTokenCreateQuery,
        variables: {
          input: {
            email: email,
            password: password,
          },
        },
      },
      {
        headers: {
          'X-Shopify-Storefront-Access-Token': `${process.env.SHOPIFY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log("Shopify API response (token):", response.data);

    if (response.data.errors || response.data.data.customerAccessTokenCreate.userErrors.length > 0) {
      const userErrors = response.data.data.customerAccessTokenCreate.userErrors;
      console.error("User errors:", userErrors);

      const unidentifiedCustomerError = userErrors.find(error => error.message === 'Unidentified customer');

      if (!unidentifiedCustomerError) {
        // If the error is not related to an unidentified customer, return null
        return null;
      }

      // Proceed to create the customer since they don't exist
      response = await axios.post(
        `https://${process.env.SHOPIFY_STORE_URL}/api/2024-07/graphql.json`,
        {
          query: createCustomerQuery,
          variables: {
            input: {
              email: email,
              phone: formattedPhoneNumber,  // Use the formatted phone number
              password: password,
            },
          },
        },
        {
          headers: {
            'X-Shopify-Storefront-Access-Token': `${process.env.SHOPIFY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log("Shopify API response (create customer):", response.data);

      if (response.data.errors || response.data.data.customerCreate.userErrors.length > 0) {
        console.error("User errors:", response.data.data.customerCreate.userErrors);
        return null;
      }

      // After successful customer creation, generate the access token
      response = await axios.post(
        `https://${process.env.SHOPIFY_STORE_URL}/api/2024-07/graphql.json`,
        {
          query: customerAccessTokenCreateQuery,
          variables: {
            input: {
              email: email,
              password: password,
            },
          },
        },
        {
          headers: {
            'X-Shopify-Storefront-Access-Token': `${process.env.SHOPIFY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log("Shopify API response (token after creation):", response.data);

      if (response.data.errors || response.data.data.customerAccessTokenCreate.userErrors.length > 0) {
        console.error("User errors:", response.data.data.customerAccessTokenCreate.userErrors);
        return null;
      }

      const accessToken = response.data.data.customerAccessTokenCreate.customerAccessToken.accessToken;

      return {
        accessToken,
      };
    }

    const accessToken = response.data.data.customerAccessTokenCreate.customerAccessToken.accessToken;

    return {
      accessToken,
    };
  } catch (error) {
    console.error("Error in createOrLoginCustomer:", error.response ? error.response.data : error.message);
    return null;
  }
}



app.listen(3000, () => console.log('Server running on port 3000'));
