module Main exposing (main)

import Html exposing (..)
import Html.Attributes exposing (..)


main =
    ul []
        [ li [] [ text "jinjor" ]
        , li []
            [ a
                [ href "https://twitter.com/jinjor"
                , target "_blank"
                ]
                [ text "Twitter" ]
            ]
        , li [] [ text "elm" ]
        , li [] [ text "deno は「デノ」" ]
        ]
