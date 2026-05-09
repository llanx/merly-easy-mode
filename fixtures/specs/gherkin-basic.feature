Feature: Checkout

  Scenario: Successful card payment
    Given a shopper has items in the cart
    When the shopper submits a valid card payment
    Then the order is created
    And a receipt is sent
