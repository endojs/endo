export const makeWallet = ({ fetch }) => {
  return harden({
    executeOffer(offer) {
      const seat = harden({
        getPayouts() {
          return harden({ Out: '0IST' });
        },
      });
      return seat;
    },
  });
};
