#  This file is part of Ezra Project.
#
#  Copyright (C) 2019 - 2021 Tobias Klein <contact@ezra-project.net>
#
#  Ezra Project is free software: you can redistribute it and/or modify
#  it under the terms of the GNU General Public License as published by
#  the Free Software Foundation, either version 2 of the License, or
#  (at your option) any later version.
#
#  Ezra Project is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.
#
#  You should have received a copy of the GNU General Public License
#  along with Ezra Project. See the file LICENSE.
#  If not, see <http://www.gnu.org/licenses/>.

# features/004_bible_browsing.feature

Feature: Bible browsing
  In order to do study the text of a book
  I can open the book for browsing

  Scenario: Basic browsing
    Given I open the book selection menu
    When I select the book Ephesians
    Then the tab title is "Ephesians [KJV]"
    And the book of Ephesians is opened in the current tab