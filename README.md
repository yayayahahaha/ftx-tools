# FTX Tools

make your ftx smart  

### How to use
1. copy `input.json.default` to `input.json` and install npm pacakges
```bash
# npm install
npm install

# copy input.json.default to input.json
cp input.json.default input.json
```
2. modfied `input.json` , paste your `apiKey` and `secrectKey` (generate your api key [here](https://ftx.com/profile))
```json
{
  "apiKey": "{YOUR-API-KEY}",
  "secretKey": "{YOUR-SECRECT-KEY}"
}
```
3. run `npm run earn_current` to get your earning count
```bash
# run `npm run earn_current` to get your earning count
npm run earn_current
```
> run `npm run earn_current -- --subAccount={YOUR-SUB_ACCOUNT-NAME}` to work in subAccount
4. run `npm run lending_offer` to send lending offers
```bash
# run `npm run lending_offer` to send lending offers
npm run lending_offer
```
> run `npm run lending_offer -- --subAccount={YOUR-SUB_ACCOUNT-NAME}` to work in subAccount
