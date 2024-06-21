import React from 'react';

import { decimalEthToHexWei } from '../utils.js';

/**
 * @param {{ defaultValue: string | number, fieldName: string, readOnly?: boolean }} props
 */
const FormInput = ({ defaultValue, fieldName, readOnly = false }) => {
  const inputStyle = {
    padding: '8px',
    fontSize: '16px',
    borderRadius: '4px',
    border: '1px solid #ccc', // Light grey border
    backgroundColor: readOnly ? '#f0f0f0' : '#fff',
    color: readOnly ? '#888' : '#000',
    cursor: readOnly ? 'not-allowed' : 'text',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '1px',
    fontWeight: 'bold',
  };

  return [
    React.createElement(
      'label',
      { key: `${fieldName}-label`, style: labelStyle },
      fieldName,
    ),
    React.createElement('input', {
      name: fieldName,
      defaultValue,
      key: fieldName,
      style: inputStyle,
      readOnly,
    }),
  ];
};

/**
 * @param {any} props
 */
export const TxForm = ({ sendTransaction }) => {
  /**
   * @param {Event} submissionEvent
   */
  const handleSubmit = (submissionEvent) => {
    submissionEvent.preventDefault();

    /** @type {any} */
    const { target: form } = submissionEvent;
    const txParams = {
      from: form.from.value,
      to: form.to.value,
      value: decimalEthToHexWei(form.value.value),
      gasLimit: form.gasLimit.value,
      gasPrice: form.gasPrice.value,
      type: form.type.value,
    };

    sendTransaction(txParams).catch(console.error);
  };

  const formStyle = {
    display: 'grid',
    gridTemplateColumns: 'calc(250px / 2) minmax(250px, 1fr)', // Left column is half the width of the right column, with the right column having a minimum width of 250px
    gap: '10px', // Adds space between form elements
    maxWidth: '500px', // Sets a max width for the form
    margin: '20px auto', // Centers the form on the page
  };

  const buttonStyle = {
    padding: '10px 15px',
    fontSize: '16px',
    borderRadius: '4px',
    backgroundColor: '#007bff', // Blue
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    'grid-column': '2 / 3',
  };

  return React.createElement(
    'form',
    { onSubmit: handleSubmit, style: formStyle },
    [
      React.createElement(FormInput, {
        fieldName: 'from',
        defaultValue: '0xc6D5a3c98EC9073B54FA0969957Bd582e8D874bf',
      }),
      React.createElement(FormInput, {
        fieldName: 'to',
        defaultValue: '0x59A897A2dbd55D20bCC9B52d5eaA14E2859Dc467',
      }),
      React.createElement(FormInput, {
        fieldName: 'value',
        // defaultValue: '0xde0b6b3a7640000',
        defaultValue: '1',
      }),
      React.createElement(FormInput, {
        fieldName: 'gasLimit',
        defaultValue: '0x5208',
        readOnly: true,
      }),
      React.createElement(FormInput, {
        fieldName: 'gasPrice',
        defaultValue: '0x2540be400',
        readOnly: true,
      }),
      React.createElement(FormInput, {
        fieldName: 'type',
        defaultValue: '0x0',
        readOnly: true,
      }),
      React.createElement(
        'button',
        { type: 'submit', key: 'submit', style: buttonStyle },
        'Send Transaction',
      ),
    ],
  );
};
